"""RQ queue management."""

from typing import Optional

from rq import Queue
from rq.job import Job

from app.workers.connection import get_redis_connection


# Queue names
QUEUE_DEFAULT = "default"
QUEUE_TRANSCRIPTION = "transcription"
QUEUE_EMBEDDING = "embedding"
QUEUE_SUMMARIZATION = "summarization"


def get_queue(queue_name: str = QUEUE_DEFAULT) -> Queue:
    """
    Get RQ queue instance.

    Args:
        queue_name: Name of the queue (default, transcription, embedding, summarization)

    Returns:
        Queue: RQ Queue instance
    """
    redis_conn = get_redis_connection()
    return Queue(queue_name, connection=redis_conn)


def get_default_queue() -> Queue:
    """Get default queue."""
    return get_queue(QUEUE_DEFAULT)


def get_transcription_queue() -> Queue:
    """Get transcription queue for audio processing jobs."""
    return get_queue(QUEUE_TRANSCRIPTION)


def get_embedding_queue() -> Queue:
    """Get embedding queue for vector generation jobs."""
    return get_queue(QUEUE_EMBEDDING)


def get_summarization_queue() -> Queue:
    """Get summarization queue for AI summary jobs."""
    return get_queue(QUEUE_SUMMARIZATION)


def get_job(job_id: str, queue_name: str = QUEUE_DEFAULT) -> Optional[Job]:
    """
    Get job by ID.

    Args:
        job_id: Job ID
        queue_name: Queue name where job was enqueued

    Returns:
        Job instance or None if not found
    """
    try:
        redis_conn = get_redis_connection()
        return Job.fetch(job_id, connection=redis_conn)
    except Exception:
        return None


def get_job_status(job_id: str, queue_name: str = QUEUE_DEFAULT) -> Optional[str]:
    """
    Get job status.

    Args:
        job_id: Job ID
        queue_name: Queue name where job was enqueued

    Returns:
        Job status string or None if not found
        Possible statuses: 'queued', 'started', 'finished', 'failed', 'canceled'
    """
    job = get_job(job_id, queue_name)
    if job:
        return job.get_status()
    return None


def cancel_job(job_id: str, queue_name: str = QUEUE_DEFAULT) -> bool:
    """
    Cancel a job.

    Args:
        job_id: Job ID
        queue_name: Queue name where job was enqueued

    Returns:
        bool: True if job was canceled, False otherwise
    """
    job = get_job(job_id, queue_name)
    if job:
        job.cancel()
        return True
    return False


def get_queue_length(queue_name: str = QUEUE_DEFAULT) -> int:
    """
    Get number of jobs in queue.

    Args:
        queue_name: Queue name

    Returns:
        int: Number of jobs in queue
    """
    queue = get_queue(queue_name)
    return len(queue)


def clear_queue(queue_name: str = QUEUE_DEFAULT) -> int:
    """
    Clear all jobs from queue.

    Args:
        queue_name: Queue name

    Returns:
        int: Number of jobs removed
    """
    queue = get_queue(queue_name)
    count = len(queue)
    queue.empty()
    return count
