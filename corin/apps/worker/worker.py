from rq import Worker

from app.queue import get_queue
from app import tasks  # noqa: F401


def main() -> None:
    queue = get_queue()
    worker = Worker([queue], connection=queue.connection)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
