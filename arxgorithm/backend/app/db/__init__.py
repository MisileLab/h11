"""Database initialization and management for arXgorithm."""

import sqlite3
from pathlib import Path

import sqlite_vec


def database_url_to_path(database_url: str) -> str:
    if database_url.startswith("sqlite:///"):
        return database_url[10:]
    if database_url.startswith("sqlite://"):
        return database_url[9:]
    raise ValueError(f"Invalid database URL format: {database_url}")


async def init_db(db_path: str) -> sqlite3.Connection:
    """
    Initialize SQLite database with sqlite-vec extension and schema.

    Args:
        db_path: Path to database file or ':memory:' for in-memory database.

    Returns:
        sqlite3.Connection object connected to initialized database.
    """
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)

    # Enable loading extensions
    conn.enable_load_extension(True)

    # Load sqlite-vec extension
    sqlite_vec.load(conn)

    # Disable extension loading after load complete
    conn.enable_load_extension(False)

    # Read and execute schema
    schema_path = Path(__file__).parent / "schema.sql"
    with open(schema_path) as f:
        schema = f.read()

    conn.executescript(schema)
    conn.commit()

    return conn


def get_db_connection(database_url: str) -> sqlite3.Connection:
    """
    Get a SQLite database connection from a database URL.

    Args:
        database_url: Database URL (e.g., 'sqlite:///./arxgorithm.db')

    Returns:
        sqlite3.Connection object

    Raises:
        ValueError: If URL format is invalid
    """
    db_path = database_url_to_path(database_url)
    conn = sqlite3.connect(db_path)
    return conn
