from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional
import secrets

ph = PasswordHasher()

SECRET_KEY = secrets.token_urlsafe(32)
ALGORITHM = "HS256"
SESSION_EXPIRE_HOURS = 24


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        ph.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False


def get_password_hash(password: str) -> str:
    return ph.hash(password)


def create_session_token(user_id: int) -> str:
    """Create session token"""
    expire = datetime.utcnow() + timedelta(hours=SESSION_EXPIRE_HOURS)
    to_encode = {"sub": str(user_id), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_session_token(token: str) -> Optional[int]:
    """Verify session token and return user_id"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            return None
        return int(user_id)
    except JWTError:
        return None
