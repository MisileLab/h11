from fastapi import Header, HTTPException

from app.config import get_settings


def get_current_user(x_user_email: str | None = Header(default=None)) -> str | None:
    settings = get_settings()
    if settings.single_user_email and x_user_email:
        if x_user_email.lower() != settings.single_user_email.lower():
            raise HTTPException(status_code=401, detail="Unauthorized")
    return x_user_email or settings.single_user_email
