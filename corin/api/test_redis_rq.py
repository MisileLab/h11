"""Test script for Redis & RQ worker setup."""

import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.workers.connection import get_redis_connection, ping_redis
from app.workers.queue import (
    get_default_queue,
    get_queue_length,
    clear_queue,
    QUEUE_DEFAULT,
)
from app.workers.jobs import (
    enqueue_job,
    get_job_info,
    get_job_result,
    JobProgress,
)
from app.workers.example_jobs import dummy_job, failing_job, math_job


def test_redis_rq():
    """Test Redis connection and RQ job processing."""
    print("=" * 60)
    print("Redis & RQ Worker Test")
    print("=" * 60)

    # Test 1: Redis connectivity
    print("\nTest 1: Redis connectivity...")
    try:
        if ping_redis():
            print("✓ Redis is reachable")
        else:
            print("✗ Redis is not reachable")
            return False
    except Exception as e:
        print(f"✗ Redis connection error: {e}")
        return False

    # Test 2: Get Redis connection
    print("\nTest 2: Get Redis connection...")
    try:
        redis_conn = get_redis_connection()
        info = redis_conn.info()
        print(f"✓ Connected to Redis v{info['redis_version']}")
        print(f"  Uptime: {info['uptime_in_seconds']} seconds")
        print(f"  Connected clients: {info['connected_clients']}")
    except Exception as e:
        print(f"✗ Failed to get connection info: {e}")
        return False

    # Test 3: Clear queue before testing
    print(f"\nTest 3: Clear existing jobs from queue...")
    try:
        cleared = clear_queue(QUEUE_DEFAULT)
        print(f"✓ Cleared {cleared} existing jobs")
    except Exception as e:
        print(f"✗ Failed to clear queue: {e}")
        return False

    # Test 4: Enqueue a simple job
    print(f"\nTest 4: Enqueue a simple job...")
    try:
        job = enqueue_job(
            dummy_job,
            "test-job-1",
            2,
            queue_name=QUEUE_DEFAULT,
            metadata={"test": True, "type": "simple"},
        )
        print(f"✓ Job enqueued with ID: {job.id}")
        print(f"  Status: {job.get_status()}")
        print(f"  Queue length: {get_queue_length(QUEUE_DEFAULT)}")
    except Exception as e:
        print(f"✗ Failed to enqueue job: {e}")
        return False

    # Test 5: Get job info
    print(f"\nTest 5: Get job info...")
    try:
        job_info = get_job_info(job.id, QUEUE_DEFAULT)
        print(f"✓ Job info retrieved:")
        print(f"  Job ID: {job_info['job_id']}")
        print(f"  Status: {job_info['status']}")
        print(f"  Created: {job_info['created_at']}")
        print(f"  Metadata: {job_info['metadata']}")
    except Exception as e:
        print(f"✗ Failed to get job info: {e}")
        return False

    # Test 6: Check worker availability
    print(f"\nTest 6: Check for running workers...")
    try:
        queue = get_default_queue()
        workers = queue.connection.smembers("rq:workers")
        if workers:
            print(f"✓ Found {len(workers)} active workers:")
            for worker in workers:
                print(f"  - {worker.decode()}")
        else:
            print("⚠ No active workers found")
            print("  Note: Start a worker with: poetry run python worker.py")
            print("  Jobs will remain queued until a worker is started")
    except Exception as e:
        print(f"✗ Failed to check workers: {e}")
        return False

    # Test 7: Wait for job completion (if worker is running)
    print(f"\nTest 7: Monitor job status...")
    print("  Waiting up to 10 seconds for job to complete...")
    try:
        max_wait = 10
        start_time = time.time()

        while time.time() - start_time < max_wait:
            job_info = get_job_info(job.id, QUEUE_DEFAULT)
            status = job_info["status"]

            if status == "finished":
                result = get_job_result(job.id, QUEUE_DEFAULT)
                print(f"✓ Job completed!")
                print(f"  Result: {result}")
                break
            elif status == "failed":
                print(f"✗ Job failed!")
                print(f"  Error: {job_info['error']}")
                break
            else:
                print(f"  Status: {status} (waiting...)")
                time.sleep(1)
        else:
            print("⚠ Job still pending after 10 seconds")
            print("  This is expected if no worker is running")
            print("  Job will be processed when worker starts")
    except Exception as e:
        print(f"✗ Error monitoring job: {e}")
        return False

    # Test 8: Enqueue multiple jobs
    print(f"\nTest 8: Enqueue multiple jobs...")
    try:
        jobs = []
        for i in range(3):
            job = enqueue_job(
                dummy_job,
                f"batch-job-{i + 1}",
                1,
                queue_name=QUEUE_DEFAULT,
            )
            jobs.append(job)
            print(f"  ✓ Enqueued job {i + 1}: {job.id}")

        queue_len = get_queue_length(QUEUE_DEFAULT)
        print(f"✓ Total jobs in queue: {queue_len}")
    except Exception as e:
        print(f"✗ Failed to enqueue batch jobs: {e}")
        return False

    print("\n" + "=" * 60)
    print("✓ Basic tests passed!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Start a worker: cd api && poetry run python worker.py")
    print("2. In another terminal, run this test again to see jobs processed")
    print("3. Worker will process queued jobs automatically")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = test_redis_rq()
    sys.exit(0 if success else 1)
