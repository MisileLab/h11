"""Tests for database schema and initialization."""

import sqlite3
import struct

import pytest

from app.db import init_db


@pytest.mark.asyncio
async def test_init_db_memory():
    """Test that init_db creates all tables in memory."""
    conn = await init_db(":memory:")
    assert conn is not None
    assert isinstance(conn, sqlite3.Connection)


@pytest.mark.asyncio
async def test_papers_table_exists():
    """Test that papers table is created with correct schema."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    # Check table exists
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='papers'"
    )
    assert cursor.fetchone() is not None

    # Check columns
    cursor.execute("PRAGMA table_info(papers)")
    columns = {row[1]: row[2] for row in cursor.fetchall()}

    assert "id" in columns
    assert "arxiv_id" in columns
    assert "title" in columns
    assert "abstract" in columns
    assert "authors" in columns
    assert "categories" in columns
    assert "published_at" in columns
    assert "updated_at" in columns
    assert "created_at" in columns


@pytest.mark.asyncio
async def test_embeddings_virtual_table_exists():
    """Test that embeddings virtual table exists."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'"
    )
    assert cursor.fetchone() is not None


@pytest.mark.asyncio
async def test_users_table_exists():
    """Test that users table is created."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    assert cursor.fetchone() is not None

    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1]: row[2] for row in cursor.fetchall()}

    assert "id" in columns
    assert "oauth_provider" in columns
    assert "oauth_id" in columns
    assert "email" in columns
    assert "name" in columns
    assert "created_at" in columns


@pytest.mark.asyncio
async def test_reading_list_table_exists():
    """Test that reading_list table is created."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='reading_list'"
    )
    assert cursor.fetchone() is not None

    cursor.execute("PRAGMA table_info(reading_list)")
    columns = {row[1]: row[2] for row in cursor.fetchall()}

    assert "id" in columns
    assert "user_id" in columns
    assert "anonymous_id" in columns
    assert "paper_id" in columns
    assert "saved_at" in columns


@pytest.mark.asyncio
async def test_anonymous_sessions_table_exists():
    """Test that anonymous_sessions table is created."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='anonymous_sessions'"
    )
    assert cursor.fetchone() is not None

    cursor.execute("PRAGMA table_info(anonymous_sessions)")
    columns = {row[1]: row[2] for row in cursor.fetchall()}

    assert "id" in columns
    assert "cookie_uuid" in columns
    assert "created_at" in columns
    assert "last_seen_at" in columns


@pytest.mark.asyncio
async def test_pragmas_set():
    """Test that pragmas are correctly set."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    cursor.execute("PRAGMA foreign_keys")
    assert cursor.fetchone()[0] == 1  # ON

    # WAL mode not available for :memory: databases; would be set for file-based DBs
    # Just verify foreign_keys are ON


@pytest.mark.asyncio
async def test_arxiv_id_unique():
    """Test that arxiv_id has unique constraint."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    # Insert first paper
    cursor.execute(
        """
        INSERT INTO papers 
        (arxiv_id, title, abstract, authors, categories, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "2301.00001",
            "Test Paper",
            "Test abstract",
            '["Author A"]',
            '["cs.AI"]',
            1672531200,
            1672531200,
        ),
    )
    conn.commit()

    # Try to insert duplicate arxiv_id
    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute(
            """
            INSERT INTO papers 
            (arxiv_id, title, abstract, authors, categories, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "2301.00001",
                "Another Paper",
                "Different abstract",
                '["Author B"]',
                '["cs.CV"]',
                1672531200,
                1672531200,
            ),
        )


@pytest.mark.asyncio
async def test_sqlite_vec_loads():
    """Test that sqlite-vec extension loads and works."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    # Create a 1024-dim vector encoded as binary (float32 format for sqlite-vec)
    vec = [0.1] * 1024
    vec_bytes = struct.pack(f"{len(vec)}f", *vec)

    cursor.execute(
        "INSERT INTO embeddings (embedding) VALUES (?)",
        (vec_bytes,),
    )
    conn.commit()

    # Query back
    cursor.execute("SELECT COUNT(*) FROM embeddings")
    count = cursor.fetchone()[0]
    assert count == 1


@pytest.mark.asyncio
async def test_reading_list_nullable_ids():
    """Test that reading_list supports either user_id or anonymous_id."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    # Insert a paper first
    cursor.execute(
        """
        INSERT INTO papers 
        (arxiv_id, title, abstract, authors, categories, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "2301.00001",
            "Test Paper",
            "Test abstract",
            '["Author A"]',
            '["cs.AI"]',
            1672531200,
            1672531200,
        ),
    )

    paper_id = cursor.lastrowid

    # Insert reading list entry with anonymous_id only
    cursor.execute(
        """
        INSERT INTO reading_list (anonymous_id, paper_id)
        VALUES (?, ?)
        """,
        ("anon-uuid-123", paper_id),
    )
    conn.commit()

    # Verify insert succeeded
    cursor.execute("SELECT COUNT(*) FROM reading_list")
    assert cursor.fetchone()[0] == 1

    # Check the data
    cursor.execute("SELECT user_id, anonymous_id, paper_id FROM reading_list")
    row = cursor.fetchone()
    assert row[0] is None  # user_id should be NULL
    assert row[1] == "anon-uuid-123"  # anonymous_id should be set
    assert row[2] == paper_id


@pytest.mark.asyncio
async def test_indexes_created():
    """Test that all indexes are created."""
    conn = await init_db(":memory:")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    )
    indexes = {row[0] for row in cursor.fetchall()}

    expected_indexes = {
        "idx_papers_arxiv_id",
        "idx_papers_published_at",
        "idx_reading_list_user_id",
        "idx_reading_list_anonymous_id",
        "idx_reading_list_paper_id",
        "idx_anonymous_sessions_cookie",
    }

    assert expected_indexes.issubset(indexes)
