"""Job management and status tracking."""

import json
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional, Dict

from rq import Retry
from rq.job import Job

from app.workers.queue import (
    get_queue,
    get_job,
    QUEUE_DEFAULT,
    QUEUE_TRANSCRIPTION,
    QUEUE_EMBEDDING,
    QUEUE_SUMMARIZATION,
)


class JobStatus(str, Enum):
    """Job status enumeration."""

    QUEUED = "queued"
    STARTED = "started"
    FINISHED = "finished"
    FAILED = "failed"
    CANCELED = "canceled"


class JobProgress:
    """Job progress tracking helper."""

    def __init__(self, job_id: str):
        """
        Initialize job progress tracker.

        Args:
            job_id: RQ job ID
        """
        self.job_id = job_id
        self.job = get_job(job_id)

    def update(
        self,
        stage: str,
        progress: int,
        message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Update job progress.

        Args:
            stage: Current processing stage
            progress: Progress percentage (0-100)
            message: Optional status message
            metadata: Optional metadata dict
        """
        if not self.job:
            return

        progress_data = {
            "stage": stage,
            "progress": progress,
            "message": message,
            "updated_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
        }

        # Store in job meta
        self.job.meta["progress"] = progress_data
        self.job.save_meta()

    def get(self) -> Optional[Dict[str, Any]]:
        """
        Get current progress.

        Returns:
            Progress dict or None
        """
        if not self.job:
            return None

        return self.job.meta.get("progress")


def enqueue_job(
    func: Callable,
    *args,
    queue_name: str = QUEUE_DEFAULT,
    job_id: Optional[str] = None,
    timeout: Optional[int] = None,
    result_ttl: int = 3600,
    failure_ttl: int = 86400,
    retry: Optional[Retry] = None,
    depends_on: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    **kwargs,
) -> Job:
    """
    Enqueue a job to RQ.

    Args:
        func: Function to execute
        *args: Positional arguments for function
        queue_name: Queue name (default, transcription, embedding, summarization)
        job_id: Optional custom job ID
        timeout: Job timeout in seconds (default: 180s for default queue)
        result_ttl: How long to keep job results (seconds, default: 1 hour)
        failure_ttl: How long to keep failed jobs (seconds, default: 24 hours)
        retry: Retry policy (e.g., Retry(max=3, interval=[10, 30, 60]))
        depends_on: Job ID this job depends on
        metadata: Optional metadata to attach to job
        **kwargs: Keyword arguments for function

    Returns:
        Job: RQ Job instance
    """
    queue = get_queue(queue_name)

    # Set default timeout based on queue
    if timeout is None:
        if queue_name == QUEUE_TRANSCRIPTION:
            timeout = 3600  # 1 hour for transcription
        elif queue_name == QUEUE_EMBEDDING:
            timeout = 600  # 10 minutes for embeddings
        elif queue_name == QUEUE_SUMMARIZATION:
            timeout = 900  # 15 minutes for summarization
        else:
            timeout = 180  # 3 minutes default

    # Enqueue job
    job = queue.enqueue(
        func,
        *args,
        job_id=job_id,
        timeout=timeout,
        result_ttl=result_ttl,
        failure_ttl=failure_ttl,
        retry=retry,
        depends_on=depends_on,
        meta={"metadata": metadata or {}},
        **kwargs,
    )

    return job


def get_job_result(job_id: str, queue_name: str = QUEUE_DEFAULT) -> Optional[Any]:
    """
    Get job result.

    Args:
        job_id: Job ID
        queue_name: Queue name

    Returns:
        Job result or None
    """
    job = get_job(job_id, queue_name)
    if job and job.is_finished:
        return job.result
    return None


def get_job_error(job_id: str, queue_name: str = QUEUE_DEFAULT) -> Optional[str]:
    """
    Get job error message if failed.

    Args:
        job_id: Job ID
        queue_name: Queue name

    Returns:
        Error message or None
    """
    job = get_job(job_id, queue_name)
    if job and job.is_failed:
        return str(job.exc_info)
    return None


def get_job_info(job_id: str, queue_name: str = QUEUE_DEFAULT) -> Optional[Dict[str, Any]]:
    """
    Get comprehensive job information.

    Args:
        job_id: Job ID
        queue_name: Queue name

    Returns:
        Job info dict or None
    """
    job = get_job(job_id, queue_name)
    if not job:
        return None

    # Get progress if available
    progress = job.meta.get("progress")

    return {
        "job_id": job.id,
        "status": job.get_status(),
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "enqueued_at": job.enqueued_at.isoformat() if job.enqueued_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "ended_at": job.ended_at.isoformat() if job.ended_at else None,
        "result": job.result if job.is_finished else None,
        "error": str(job.exc_info) if job.is_failed else None,
        "progress": progress,
        "metadata": job.meta.get("metadata", {}),
    }


def update_job_progress(
    job_id: str,
    stage: str,
    progress: int,
    message: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Update job progress (convenience wrapper around JobProgress).

    Args:
        job_id: RQ job ID
        stage: Current processing stage
        progress: Progress percentage (0-100)
        message: Optional status message
        metadata: Optional metadata dict
    """
    tracker = JobProgress(job_id)
    tracker.update(stage, progress, message, metadata)


# Job function registry
# These will be imported by worker.py to register callable functions
__all__ = [
    "JobStatus",
    "JobProgress",
    "enqueue_job",
    "update_job_progress",
    "get_job_result",
    "get_job_error",
    "get_job_info",
]
