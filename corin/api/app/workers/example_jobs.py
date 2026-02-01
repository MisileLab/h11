"""Example job functions for testing."""

import time


def dummy_job(name: str, duration: int = 2) -> str:
    """
    Dummy job for testing.

    Args:
        name: Job name
        duration: How long to sleep (seconds)

    Returns:
        Success message
    """
    print(f"[WORKER] Starting job: {name}")

    # Simulate work
    for i in range(duration):
        time.sleep(1)
        progress = int((i + 1) / duration * 100)
        print(f"[WORKER] Progress: {progress}%")

    print(f"[WORKER] Completed job: {name}")
    return f"Job '{name}' completed successfully!"


def failing_job(message: str) -> None:
    """
    Job that always fails (for testing error handling).

    Args:
        message: Error message to raise
    """
    print(f"[WORKER] Starting failing job...")
    time.sleep(1)
    raise ValueError(f"Intentional failure: {message}")


def math_job(a: int, b: int, operation: str = "add") -> int:
    """
    Simple math job.

    Args:
        a: First number
        b: Second number
        operation: Operation to perform (add, subtract, multiply, divide)

    Returns:
        Result of operation
    """
    print(f"[WORKER] Computing {a} {operation} {b}")
    time.sleep(1)

    if operation == "add":
        result = a + b
    elif operation == "subtract":
        result = a - b
    elif operation == "multiply":
        result = a * b
    elif operation == "divide":
        if b == 0:
            raise ValueError("Division by zero")
        result = a / b
    else:
        raise ValueError(f"Unknown operation: {operation}")

    print(f"[WORKER] Result: {result}")
    return result
