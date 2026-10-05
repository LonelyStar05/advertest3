"""`attack_specs.display`: thông tin hiển thị của attack spec (bổ sung 2026-10,
docs/mo-rong-bang-config.md).

JSON theo `AttackSpecDisplay` (tên, mô tả tiếng Việt / tiếng Anh, level mặc định và gợi ý), null khi
chưa khai. Không thuộc `spec` và không vào `spec_sha256`, nên `advertest-admin catalog sync` được
cập nhật cột này trên spec đã có. Quyền của `advertest_app` trên `attack_specs` đã cấp ở 0001.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("attack_specs", sa.Column("display", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("attack_specs", "display")
