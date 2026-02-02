import json
import subprocess
import time
from pathlib import Path

from gqldb import GQLDBClient


def test_health_endpoint() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    server_process = subprocess.Popen(
        ["cargo", "run", "-p", "gqldb-server"],
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        client = GQLDBClient("http://127.0.0.1:8080/graphql")
        for _ in range(10):
            time.sleep(1)
            if client.health():
                break
        assert client.health() is True
    finally:
        server_process.terminate()
        server_process.wait(timeout=10)
