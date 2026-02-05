from sqlmodel import SQLModel, create_engine, Session
from typing import Generator

DATABASE_URL = "sqlite:////data/opencode_workbench.db"

engine = create_engine(
    DATABASE_URL, echo=False, connect_args={"check_same_thread": False}
)


def init_db():
    """Initialize database tables"""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Get database session"""
    with Session(engine) as session:
        yield session
