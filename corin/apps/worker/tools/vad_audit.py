import argparse
import random
import uuid

from sqlalchemy import select

from app.db import SessionLocal
from app.models import VadSegment


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("meeting_id")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    meeting_id = uuid.UUID(args.meeting_id)
    with SessionLocal() as session:
        segments = (
            session.execute(
                select(VadSegment).where(VadSegment.meeting_id == meeting_id)
            )
            .scalars()
            .all()
        )
    if not segments:
        print("No VAD segments found")
        return
    sample = random.sample(segments, k=min(args.limit, len(segments)))
    for seg in sample:
        print(
            f"segment {seg.id} start={seg.start_ms} end={seg.end_ms} "
            f"padded={seg.padded_start_ms}-{seg.padded_end_ms}"
        )


if __name__ == "__main__":
    main()
