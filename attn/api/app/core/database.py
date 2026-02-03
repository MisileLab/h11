from sqlmodel import create_engine, SQLModel, Session
from app.core.config import DATABASE_URL, DB_PATH

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
