"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("nickname", sa.String(50), nullable=False),
        sa.Column("native_lang", sa.String(10), server_default="ko", nullable=False),
        sa.Column("target_lang", sa.String(10), server_default="en", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "diaries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "conversation_sessions",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("diary_id", sa.Integer(), sa.ForeignKey("diaries.id"), nullable=True),
        sa.Column("status", sa.String(20), server_default="created", nullable=False),
        sa.Column("turn_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.String(50), sa.ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("message_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "learning_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("diary_id", sa.Integer(), sa.ForeignKey("diaries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("card_type", sa.String(10), nullable=False),
        sa.Column("content_en", sa.Text(), nullable=False),
        sa.Column("content_ko", sa.Text(), nullable=False),
        sa.Column("part_of_speech", sa.String(20), nullable=True),
        sa.Column("cefr_level", sa.String(5), nullable=True),
        sa.Column("example_en", sa.Text(), nullable=True),
        sa.Column("example_ko", sa.Text(), nullable=True),
        sa.Column("card_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "pronunciation_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("learning_cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("audio_url", sa.String(500), nullable=True),
        sa.Column("accuracy_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("fluency_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("completeness_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("overall_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("attempt_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "tts_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("text_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("audio_url", sa.String(500), nullable=False),
        sa.Column("voice_id", sa.String(50), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # Indexes
    op.create_index("idx_conversation_sessions_user", "conversation_sessions", ["user_id", sa.text("created_at DESC")])
    op.create_index("idx_conversation_messages_session", "conversation_messages", ["session_id", "message_order"])
    op.create_index("idx_diaries_user_created", "diaries", ["user_id", sa.text("created_at DESC")])
    op.create_index("idx_learning_cards_diary_id", "learning_cards", ["diary_id"])
    op.create_index("idx_pronunciation_results_card_id", "pronunciation_results", ["card_id"])
    op.create_index("idx_pronunciation_results_user_id", "pronunciation_results", ["user_id"])

    # Seed MVP user
    op.execute("INSERT INTO users (id, nickname, native_lang, target_lang) VALUES (1, 'MVP User', 'ko', 'en')")


def downgrade() -> None:
    op.drop_table("tts_cache")
    op.drop_table("pronunciation_results")
    op.drop_table("learning_cards")
    op.drop_table("conversation_messages")
    op.drop_table("conversation_sessions")
    op.drop_table("diaries")
    op.drop_table("users")
