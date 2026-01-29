from __future__ import annotations

import json
from dataclasses import dataclass

from openai import OpenAI

from app.config import get_settings


@dataclass
class TranscriptionSegment:
    start_ms: int
    end_ms: int
    text: str


def get_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=settings.openai_api_key)


def transcribe_audio(file_path: str) -> list[TranscriptionSegment]:
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
            TranscriptionSegment(start_ms=start_ms, end_ms=end_ms, text=text_val or "")
        )
    if segments:
        return segments
    text = getattr(response, "text", "") or ""
    return [TranscriptionSegment(start_ms=0, end_ms=0, text=text)]


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
