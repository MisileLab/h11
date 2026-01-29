from __future__ import annotations

from dataclasses import dataclass

import wave

import webrtcvad


@dataclass
class VadSegmentResult:
    start_ms: int
    end_ms: int
    padded_start_ms: int
    padded_end_ms: int
    energy_score: float | None = None


def _read_wave(path: str) -> tuple[bytes, int]:
    with wave.open(path, "rb") as wf:
        if wf.getsampwidth() != 2:
            raise ValueError("Only 16-bit PCM WAV is supported")
        sample_rate = wf.getframerate()
        audio = wf.readframes(wf.getnframes())
    return audio, sample_rate


def _frame_generator(frame_ms: int, audio: bytes, sample_rate: int):
    frame_bytes = int(sample_rate * (frame_ms / 1000.0) * 2)
    offset = 0
    timestamp_ms = 0
    duration_ms = frame_ms
    while offset + frame_bytes <= len(audio):
        yield audio[offset : offset + frame_bytes], timestamp_ms, duration_ms
        timestamp_ms += duration_ms
        offset += frame_bytes


def detect_segments(
    wav_path: str,
    frame_ms: int = 30,
    aggressiveness: int = 0,
    min_segment_ms: int = 300,
    merge_gap_ms: int = 200,
    pad_ms: int = 250,
) -> list[VadSegmentResult]:
    audio, sample_rate = _read_wave(wav_path)
    vad = webrtcvad.Vad(aggressiveness)
    segments: list[tuple[int, int]] = []
    triggered = False
    start_ms = 0

    for frame_bytes, timestamp_ms, duration_ms in _frame_generator(
        frame_ms, audio, sample_rate
    ):
        is_speech = vad.is_speech(frame_bytes, sample_rate)
        if is_speech and not triggered:
            triggered = True
            start_ms = timestamp_ms
        if triggered and not is_speech:
            end_ms = timestamp_ms + duration_ms
            segments.append((start_ms, end_ms))
            triggered = False

    if triggered:
        segments.append((start_ms, timestamp_ms + duration_ms))

    if not segments:
        return []

    merged: list[tuple[int, int]] = []
    for seg_start, seg_end in segments:
        if merged and seg_start - merged[-1][1] < merge_gap_ms:
            merged[-1] = (merged[-1][0], seg_end)
            continue
        merged.append((seg_start, seg_end))

    filtered = [seg for seg in merged if (seg[1] - seg[0]) >= min_segment_ms]

    audio_length_ms = int(len(audio) / 2 / sample_rate * 1000)
    results: list[VadSegmentResult] = []
    for seg_start, seg_end in filtered:
        padded_start = max(seg_start - pad_ms, 0)
        padded_end = min(seg_end + pad_ms, audio_length_ms)
        results.append(
            VadSegmentResult(
                start_ms=seg_start,
                end_ms=seg_end,
                padded_start_ms=padded_start,
                padded_end_ms=padded_end,
            )
        )
    return results
