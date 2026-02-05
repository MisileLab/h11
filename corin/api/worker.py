"""RQ Worker entrypoint."""

import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from rq import Worker
from rq.logutils import setup_loghandlers

from app.workers.connection import get_redis_connection
from app.workers.queue import (
    QUEUE_DEFAULT,
    QUEUE_TRANSCRIPTION,
    QUEUE_EMBEDDING,
    QUEUE_SUMMARIZATION,
)


# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def run_worker(queues: list[str]):
    """
    Run RQ worker.

    Args:
        queues: List of queue names to listen to
    """
    logger.info(f"Starting RQ worker for queues: {', '.join(queues)}")

    # Get Redis connection
    redis_conn = get_redis_connection()

    # Create worker
    worker = Worker(
        queues,
        connection=redis_conn,
        log_job_description=True,
        disable_default_exception_handler=False,
    )

    # Setup RQ log handlers
    setup_loghandlers(level=logging.INFO)

    # Start worker (blocks until interrupted)
    logger.info("Worker started and listening for jobs...")
    worker.work()


def main():
    """Main entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Corin RQ Worker")
    parser.add_argument(
        "--queues",
        "-q",
        nargs="+",
        default=[QUEUE_DEFAULT],
        choices=[QUEUE_DEFAULT, QUEUE_TRANSCRIPTION, QUEUE_EMBEDDING, QUEUE_SUMMARIZATION],
        help="Queue names to listen to (default: default)",
    )
    parser.add_argument(
        "--all",
        "-a",
        action="store_true",
        help="Listen to all queues",
    )

    args = parser.parse_args()

    # Determine which queues to listen to
    if args.all:
        queues = [QUEUE_DEFAULT, QUEUE_TRANSCRIPTION, QUEUE_EMBEDDING, QUEUE_SUMMARIZATION]
    else:
        queues = args.queues

    try:
        run_worker(queues)
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
    except Exception as e:
        logger.error(f"Worker error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
