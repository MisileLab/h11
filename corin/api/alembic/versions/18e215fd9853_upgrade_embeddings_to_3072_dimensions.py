"""upgrade_embeddings_to_3072_dimensions

Revision ID: 18e215fd9853
Revises: 1566b966834a
Create Date: 2026-02-01 19:59:14.049747

"""

from alembic import op
import sqlalchemy as sa


revision = "18e215fd9853"
down_revision = "1566b966834a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Delete existing embeddings (dimension mismatch - cannot be converted)
    op.execute("DELETE FROM embeddings")

    # Change vector dimension from 1536 to 3072
    op.execute("ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(3072)")


def downgrade() -> None:
    # Delete existing embeddings (dimension mismatch - cannot be converted)
    op.execute("DELETE FROM embeddings")

    # Revert vector dimension from 3072 back to 1536
    op.execute("ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(1536)")
