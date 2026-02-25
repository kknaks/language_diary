"""phase2 schema — languages, avatars, voices, user_profiles, refresh_tokens, user_language_levels

Revision ID: 0003
Revises: 143e44810bce
Create Date: 2026-02-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "143e44810bce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. languages
    op.create_table(
        "languages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("name_native", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )

    # 2. avatars
    op.create_table(
        "avatars",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("thumbnail_url", sa.String(500), nullable=False),
        sa.Column("primary_color", sa.String(20), nullable=False),
        sa.Column("model_url", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )

    # 3. voices (FK → languages)
    op.create_table(
        "voices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("language_id", sa.Integer(), sa.ForeignKey("languages.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("gender", sa.String(20), nullable=False),
        sa.Column("tone", sa.String(50), nullable=True),
        sa.Column("elevenlabs_voice_id", sa.String(100), nullable=False),
        sa.Column("sample_url", sa.String(500), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )

    # 4. users — add columns
    op.add_column("users", sa.Column("social_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("social_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    # 5. user_profiles
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("native_language_id", sa.Integer(), sa.ForeignKey("languages.id"), nullable=False),
        sa.Column("target_language_id", sa.Integer(), sa.ForeignKey("languages.id"), nullable=False),
        sa.Column("avatar_id", sa.Integer(), sa.ForeignKey("avatars.id"), nullable=True),
        sa.Column("avatar_name", sa.String(100), nullable=True),
        sa.Column("voice_id", sa.Integer(), sa.ForeignKey("voices.id"), nullable=True),
        sa.Column("empathy", sa.Integer(), server_default="34", nullable=False),
        sa.Column("intuition", sa.Integer(), server_default="33", nullable=False),
        sa.Column("logic", sa.Integer(), server_default="33", nullable=False),
        sa.Column("app_locale", sa.String(10), server_default="ko", nullable=False),
        sa.Column("onboarding_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # 6. refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(255), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # 7. user_language_levels
    op.create_table(
        "user_language_levels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("language_id", sa.Integer(), sa.ForeignKey("languages.id"), nullable=False),
        sa.Column("cefr_level", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "language_id", name="uq_user_language"),
    )


def downgrade() -> None:
    op.drop_table("user_language_levels")
    op.drop_table("refresh_tokens")
    op.drop_table("user_profiles")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "social_id")
    op.drop_column("users", "social_provider")
    op.drop_table("voices")
    op.drop_table("avatars")
    op.drop_table("languages")
