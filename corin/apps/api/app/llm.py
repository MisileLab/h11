from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from openai import OpenAI

from app.audio import probe_duration_ms
from app.config import get_settings


@dataclass
class TranscriptionSegment:
    start_ms: int
    end_ms: int
    text: str
    speaker: str | None = None


@dataclass
class TranscriptionUsage:
    audio_tokens: int
    text_tokens: int
    output_tokens: int


@dataclass
class TranscriptionResult:
    segments: list[TranscriptionSegment]
    usage: TranscriptionUsage | None = None


def get_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=settings.openai_api_key)


def transcribe_audio(file_path: str) -> list[TranscriptionSegment]:
    settings = get_settings()
    provider = settings.stt_provider
    if provider == "openai_4o":
        result = _transcribe_openai_4o(file_path)
        return result.segments
    elif provider == "whisper":
        result = _transcribe_whisper(file_path)
        return result.segments
    else:
        result = _transcribe_openai_4o(file_path)
        return result.segments


def transcribe_audio_with_usage(file_path: str) -> TranscriptionResult:
    settings = get_settings()
    provider = settings.stt_provider
    if provider == "openai_4o":
        return _transcribe_openai_4o(file_path)
    elif provider == "whisper":
        return _transcribe_whisper(file_path)
    else:
        return _transcribe_openai_4o(file_path)


def _get_file_size(file_path: str) -> int:
    return os.path.getsize(file_path)


def _extract_usage(response) -> TranscriptionUsage | None:
    usage_raw = getattr(response, "usage", None)
    if usage_raw is None and hasattr(response, "model_dump"):
        usage_raw = response.model_dump().get("usage")
    if usage_raw is None:
        return None
    usage_dict = (
        usage_raw.model_dump() if hasattr(usage_raw, "model_dump") else usage_raw
    )
    input_details = usage_dict.get("input_token_details", {}) or {}
    audio_tokens = int(input_details.get("audio_tokens") or 0)
    text_tokens = int(input_details.get("text_tokens") or 0)
    output_tokens = int(usage_dict.get("output_tokens") or 0)
    return TranscriptionUsage(
        audio_tokens=audio_tokens,
        text_tokens=text_tokens,
        output_tokens=output_tokens,
    )


def _normalize_speaker(speaker: str | None) -> str | None:
    if not speaker:
        return None
    if speaker.startswith("spk_"):
        return speaker
    match = re.search(r"(\d+)", speaker)
    if match:
        return f"spk_{match.group(1)}"
    return speaker


def _transcribe_openai_4o(file_path: str) -> TranscriptionResult:
    settings = get_settings()
    client = get_client()
    file_size = _get_file_size(file_path)
    max_size = 25 * 1024 * 1024

    if file_size > max_size:
        raise ValueError(
            f"File size {file_size} bytes exceeds 25MB limit for GPT-4o transcribe"
        )

    model = "gpt-4o-transcribe"
    response_format = "json"
    if settings.stt_diarize:
        model = "gpt-4o-transcribe-diarize"
        response_format = "diarized_json"

    request_args = {
        "model": model,
        "response_format": response_format,
        "temperature": 0.0,
    }
    if settings.stt_language:
        request_args["language"] = settings.stt_language

    with open(file_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            file=audio_file,
            **request_args,
        )

    segments: list[TranscriptionSegment] = []
    response_dict = response.model_dump() if hasattr(response, "model_dump") else {}
    raw_segments = getattr(response, "segments", None)
    if raw_segments is None and isinstance(response_dict, dict):
        raw_segments = response_dict.get("segments")

    for seg in raw_segments or []:
        start_val = getattr(seg, "start", None)
        end_val = getattr(seg, "end", None)
        text_val = getattr(seg, "text", None)
        speaker_val = getattr(seg, "speaker", None)
        if isinstance(seg, dict):
            start_val = seg.get("start")
            end_val = seg.get("end")
            text_val = seg.get("text")
            speaker_val = seg.get("speaker")
        start_ms = int(float(start_val or 0) * 1000)
        end_ms = int(float(end_val or 0) * 1000)
        segments.append(
            TranscriptionSegment(
                start_ms=start_ms,
                end_ms=end_ms,
                text=text_val or "",
                speaker=_normalize_speaker(speaker_val),
            )
        )

    if not segments:
        text = getattr(response, "text", None)
        if text is None and isinstance(response_dict, dict):
            text = response_dict.get("text")
        duration_ms = probe_duration_ms(file_path) or 0
        segments = [
            TranscriptionSegment(
                start_ms=0, end_ms=duration_ms, text=text or "", speaker=None
            )
        ]

    usage = _extract_usage(response)
    return TranscriptionResult(segments=segments, usage=usage)


def _transcribe_whisper(file_path: str) -> TranscriptionResult:
    settings = get_settings()
    client = get_client()
    with open(file_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            file=audio_file,
            model=settings.openai_stt_model,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segments = []
    for seg in getattr(response, "segments", []) or []:
        start_val = getattr(seg, "start", None)
        end_val = getattr(seg, "end", None)
        text_val = getattr(seg, "text", None)
        if isinstance(seg, dict):
            start_val = seg.get("start")
            end_val = seg.get("end")
            text_val = seg.get("text")
        start_ms = int(float(start_val or 0) * 1000)
        end_ms = int(float(end_val or 0) * 1000)
        segments.append(
            TranscriptionSegment(
                start_ms=start_ms, end_ms=end_ms, text=text_val or "", speaker=None
            )
        )
    if segments:
        return TranscriptionResult(segments=segments, usage=None)
    text = getattr(response, "text", "") or ""
    return TranscriptionResult(
        segments=[TranscriptionSegment(start_ms=0, end_ms=0, text=text, speaker=None)],
        usage=None,
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    client = get_client()
    response = client.embeddings.create(model=settings.openai_embed_model, input=texts)
    return [item.embedding for item in response.data]


def summarize_map(chunk_text: str) -> dict:
    settings = get_settings()
    client = get_client()
    prompt = (
        "You are summarizing a meeting transcript chunk. "
        "Return JSON with keys: agenda, decisions, action_items, issues, key_quotes, timeline. "
        "key_quotes must include start_ms, end_ms, text. "
        "timeline is list of {start_ms, end_ms, summary}."
    )
    response = client.chat.completions.create(
        model=settings.openai_chat_model,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": chunk_text},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def summarize_reduce(partials: list[dict]) -> dict:
    settings = get_settings()
    client = get_client()
    prompt = (
        "You are merging meeting summary chunks. "
        "Return final JSON with keys: work_summary and timeline. "
        "work_summary keys: agenda, decisions, action_items, issues, key_quotes. "
        "timeline is list of {start_ms, end_ms, summary}."
    )
    response = client.chat.completions.create(
        model=settings.openai_chat_model,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(partials)},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def answer_question(question: str, context: str) -> dict:
    settings = get_settings()
    client = get_client()
    prompt = (
        "You answer questions about meeting transcripts. "
        "Use ONLY the provided context. Return JSON with keys: answer, citations. "
        "citations is list of {segment_id, start_ms, end_ms, text}."
    )
    response = client.chat.completions.create(
        model=settings.openai_chat_model,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Question: {question}\nContext: {context}"},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)
