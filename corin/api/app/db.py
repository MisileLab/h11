"""Database session management and initialization.

This module provides SQLAlchemy engine and session factory configuration
for the FastAPI application. It includes:
- Engine creation with configured database URL
- SessionLocal factory for creating database sessions
- get_db() dependency for FastAPI route injection with proper cleanup

Usage in FastAPI routes:
    @router.get("/items")
    def get_items(db: Session = Depends(get_db)):
        items = db.query(Item).all()
        return items

The get_db() function handles session lifecycle management with
automatic cleanup in the finally block.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base

# Get settings
settings = get_settings()

# Create engine
engine = create_engine(
    settings.database_url,
    echo=settings.dev,  # Log SQL queries in development mode
)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def init_db() -> None:
    """Initialize database tables.

    Creates all tables defined in Base metadata.
    Note: In production, use Alembic migrations instead.
    """
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Database session dependency for FastAPI route injection.

    Yields a SQLAlchemy Session instance for use in route handlers.
    Automatically handles session cleanup in the finally block.

    Yields:
        Session: SQLAlchemy database session

    Example:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
