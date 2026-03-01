"""rename cefr_levels group to clazz

Revision ID: b1c2d3e4f5a6
Revises: 693f5c732f87
Create Date: 2026-03-01
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '693f5c732f87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('cefr_levels', 'group', new_column_name='clazz')


def downgrade() -> None:
    op.alter_column('cefr_levels', 'clazz', new_column_name='group')
