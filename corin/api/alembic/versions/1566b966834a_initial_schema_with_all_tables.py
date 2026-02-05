"""Initial schema with all tables

Revision ID: 1566b966834a
Revises:
Create Date: 2026-02-01 17:12:17.763644

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision = "1566b966834a"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("google_sub", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("picture", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_google_sub"), "users", ["google_sub"], unique=True)
    op.create_table(
        "folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["parent_id"], ["folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_folders_parent_id"), "folders", ["parent_id"], unique=False)
    op.create_index(op.f("ix_folders_user_id"), "folders", ["user_id"], unique=False)
    op.create_table(
        "meetings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("meeting_date", sa.Date(), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String()), server_default="{}", nullable=False),
        sa.Column("status", sa.String(length=50), server_default="pending_upload", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("progress_json", sa.JSON(), nullable=True),
        sa.Column("duration_sec", sa.Float(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["folder_id"], ["folders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_meetings_folder_id"), "meetings", ["folder_id"], unique=False)
    op.create_index(op.f("ix_meetings_is_deleted"), "meetings", ["is_deleted"], unique=False)
    op.create_index(op.f("ix_meetings_meeting_date"), "meetings", ["meeting_date"], unique=False)
    op.create_index(op.f("ix_meetings_status"), "meetings", ["status"], unique=False)
    op.create_index(op.f("ix_meetings_user_id"), "meetings", ["user_id"], unique=False)
    op.create_table(
        "media_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("asset_type", sa.String(length=50), nullable=False),
        sa.Column("s3_key", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_media_assets_meeting_id"), "media_assets", ["meeting_id"], unique=False
    )
    op.create_table(
        "qa_threads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_qa_threads_meeting_id"), "qa_threads", ["meeting_id"], unique=False)
    op.create_table(
        "share_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_share_links_expires_at"), "share_links", ["expires_at"], unique=False)
    op.create_index(op.f("ix_share_links_meeting_id"), "share_links", ["meeting_id"], unique=False)
    op.create_index(op.f("ix_share_links_token"), "share_links", ["token"], unique=True)
    op.create_table(
        "speakers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_speakers_meeting_id"), "speakers", ["meeting_id"], unique=False)
    op.create_table(
        "stt_usage_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("job_type", sa.String(length=50), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("clip_duration_sec", sa.Float(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("audio_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("raw_response_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_stt_usage_logs_meeting_id"), "stt_usage_logs", ["meeting_id"], unique=False
    )
    op.create_table(
        "summaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("format", sa.String(length=50), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_summaries_meeting_id"), "summaries", ["meeting_id"], unique=False)
    op.create_table(
        "transcript_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("revision_num", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_transcript_revisions_meeting_id"),
        "transcript_revisions",
        ["meeting_id"],
        unique=False,
    )
    op.create_table(
        "vad_segments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("start_sec", sa.Float(), nullable=False),
        sa.Column("end_sec", sa.Float(), nullable=False),
        sa.Column("padded_start_sec", sa.Float(), nullable=False),
        sa.Column("padded_end_sec", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_vad_segments_meeting_id"), "vad_segments", ["meeting_id"], unique=False
    )
    op.create_table(
        "qa_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["thread_id"], ["qa_threads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_qa_messages_thread_id"), "qa_messages", ["thread_id"], unique=False)
    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("speaker_id", sa.Integer(), nullable=True),
        sa.Column("start_sec", sa.Float(), nullable=False),
        sa.Column("end_sec", sa.Float(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["speaker_id"], ["speakers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_transcript_segments_meeting_id"),
        "transcript_segments",
        ["meeting_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_transcript_segments_speaker_id"),
        "transcript_segments",
        ["speaker_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_transcript_segments_start_sec"), "transcript_segments", ["start_sec"], unique=False
    )
    op.create_table(
        "embeddings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("segment_id", sa.Integer(), nullable=True),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(dim=1536), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["segment_id"], ["transcript_segments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_embeddings_meeting_id"), "embeddings", ["meeting_id"], unique=False)
    op.create_index(op.f("ix_embeddings_segment_id"), "embeddings", ["segment_id"], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f("ix_embeddings_segment_id"), table_name="embeddings")
    op.drop_index(op.f("ix_embeddings_meeting_id"), table_name="embeddings")
    op.drop_table("embeddings")
    op.drop_index(op.f("ix_transcript_segments_start_sec"), table_name="transcript_segments")
    op.drop_index(op.f("ix_transcript_segments_speaker_id"), table_name="transcript_segments")
    op.drop_index(op.f("ix_transcript_segments_meeting_id"), table_name="transcript_segments")
    op.drop_table("transcript_segments")
    op.drop_index(op.f("ix_qa_messages_thread_id"), table_name="qa_messages")
    op.drop_table("qa_messages")
    op.drop_index(op.f("ix_vad_segments_meeting_id"), table_name="vad_segments")
    op.drop_table("vad_segments")
    op.drop_index(op.f("ix_transcript_revisions_meeting_id"), table_name="transcript_revisions")
    op.drop_table("transcript_revisions")
    op.drop_index(op.f("ix_summaries_meeting_id"), table_name="summaries")
    op.drop_table("summaries")
    op.drop_index(op.f("ix_stt_usage_logs_meeting_id"), table_name="stt_usage_logs")
    op.drop_table("stt_usage_logs")
    op.drop_index(op.f("ix_speakers_meeting_id"), table_name="speakers")
    op.drop_table("speakers")
    op.drop_index(op.f("ix_share_links_token"), table_name="share_links")
    op.drop_index(op.f("ix_share_links_meeting_id"), table_name="share_links")
    op.drop_index(op.f("ix_share_links_expires_at"), table_name="share_links")
    op.drop_table("share_links")
    op.drop_index(op.f("ix_qa_threads_meeting_id"), table_name="qa_threads")
    op.drop_table("qa_threads")
    op.drop_index(op.f("ix_media_assets_meeting_id"), table_name="media_assets")
    op.drop_table("media_assets")
    op.drop_index(op.f("ix_meetings_user_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_status"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_meeting_date"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_is_deleted"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_folder_id"), table_name="meetings")
    op.drop_table("meetings")
    op.drop_index(op.f("ix_folders_user_id"), table_name="folders")
    op.drop_index(op.f("ix_folders_parent_id"), table_name="folders")
    op.drop_table("folders")
    op.drop_index(op.f("ix_users_google_sub"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    # ### end Alembic commands ###
