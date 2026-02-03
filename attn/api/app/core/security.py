import secrets
from datetime import datetime, timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from app.core.config import SESSION_MAX_AGE

ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        ph.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False


def generate_session_id() -> str:
    return secrets.token_urlsafe(32)


def get_session_expiry() -> datetime:
    return datetime.utcnow() + timedelta(seconds=SESSION_MAX_AGE)
