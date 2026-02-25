"""Home Service — assembles home screen data."""

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import NotFoundError
from app.models.diary import Diary
from app.models.profile import UserProfile
from app.models.user import User
from app.schemas.home import (
    HomeAvatar,
    HomeDiary,
    HomeResponse,
    HomeStats,
    HomeUser,
)


class HomeService:
    async def get_home_data(self, db: AsyncSession, user_id: int) -> HomeResponse:
        # 1. user + profile + avatar + target_language
        result = await db.execute(
            select(User)
            .where(User.id == user_id)
            .options(
                selectinload(User.profile).selectinload(UserProfile.target_language),
                selectinload(User.profile).selectinload(UserProfile.avatar),
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError(
                code="USER_NOT_FOUND",
                message="유저를 찾을 수 없습니다.",
            )

        # Build target_language dict
        target_language = None
        if user.profile and user.profile.target_language:
            lang = user.profile.target_language
            target_language = {
                "id": lang.id,
                "code": lang.code,
                "name_native": lang.name_native,
            }

        home_user = HomeUser(
            nickname=user.nickname,
            target_language=target_language,
        )

        # Build avatar
        avatar = None
        if user.profile and user.profile.avatar:
            av = user.profile.avatar
            avatar = HomeAvatar(
                id=av.id,
                name=av.name,
                custom_name=user.profile.avatar_name,
                thumbnail_url=av.thumbnail_url,
                primary_color=av.primary_color,
            )

        # 2. Recent diaries (5)
        diary_result = await db.execute(
            select(Diary)
            .where(Diary.user_id == user_id, Diary.deleted_at.is_(None))
            .order_by(Diary.created_at.desc())
            .limit(5)
        )
        diaries = list(diary_result.scalars().all())
        recent_diaries = [
            HomeDiary(
                id=d.id,
                original_text=d.original_text,
                translated_text=d.translated_text,
                status=d.status,
                created_at=d.created_at,
            )
            for d in diaries
        ]

        # 3. Stats
        # total_diaries
        count_result = await db.execute(
            select(func.count(Diary.id))
            .where(Diary.user_id == user_id, Diary.deleted_at.is_(None))
        )
        total_diaries = count_result.scalar() or 0

        # streak_days + today_completed
        today = date.today()
        streak_days = 0
        today_completed = False

        # Get distinct dates with diaries, ordered desc
        date_result = await db.execute(
            select(func.date(Diary.created_at))
            .where(Diary.user_id == user_id, Diary.deleted_at.is_(None))
            .group_by(func.date(Diary.created_at))
            .order_by(func.date(Diary.created_at).desc())
        )
        diary_dates = [row[0] for row in date_result.all()]

        if diary_dates:
            # Convert string dates to date objects if needed
            parsed_dates = set()
            for d in diary_dates:
                if isinstance(d, str):
                    parsed_dates.add(date.fromisoformat(d))
                elif isinstance(d, date):
                    parsed_dates.add(d)
                else:
                    # datetime object
                    parsed_dates.add(d.date() if hasattr(d, 'date') else d)

            today_completed = today in parsed_dates

            if today_completed:
                # Count consecutive days starting from today
                check_date = today
                while check_date in parsed_dates:
                    streak_days += 1
                    check_date = check_date - timedelta(days=1)
            # If today has no diary, streak is 0

        stats = HomeStats(
            total_diaries=total_diaries,
            streak_days=streak_days,
            today_completed=today_completed,
        )

        return HomeResponse(
            user=home_user,
            avatar=avatar,
            recent_diaries=recent_diaries,
            stats=stats,
        )
