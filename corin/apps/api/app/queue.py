import redis
from rq import Queue

from app.config import get_settings


def get_queue() -> Queue:
    settings = get_settings()
    connection = redis.from_url(settings.redis_url)
    return Queue("corin", connection=connection)
