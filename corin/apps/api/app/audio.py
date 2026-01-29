from __future__ import annotations

import json
import subprocess


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def extract_normalized_wav(input_path: str, output_path: str) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            output_path,
        ]
    )


def generate_playable_m4a(input_path: str, output_path: str) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            output_path,
        ]
    )


def extract_clip(input_path: str, output_path: str, start_ms: int, end_ms: int) -> None:
    start_sec = start_ms / 1000
    duration = max(end_ms - start_ms, 0) / 1000
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start_sec),
            "-i",
            input_path,
            "-t",
            str(duration),
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            output_path,
        ]
    )


def probe_duration_ms(input_path: str) -> int | None:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            input_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    duration = payload.get("format", {}).get("duration")
    if not duration:
        return None
    return int(float(duration) * 1000)
