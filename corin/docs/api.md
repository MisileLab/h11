# Corin API

Base URL: `http://localhost:8080`

## Auth
MVP uses single-user auth. When `SINGLE_USER_EMAIL` is set, pass `X-User-Email` to lock requests.

## Meetings
- `POST /meetings` create meeting metadata
- `GET /meetings?q=` list meetings (searches title, transcript, summary)
- `GET /meetings/{id}` meeting detail
- `POST /meetings/{id}/upload` upload media (multipart/form-data)
- `PATCH /meetings/{id}/speakers/{speaker_key}` rename speaker
- `POST /meetings/{id}/summaries/regenerate` regenerate summary

## Transcript
- `PATCH /segments/{id}` edit transcript segment text

## Q&A
- `POST /meetings/{id}/qa` scoped question answering

## Share
- `POST /meetings/{id}/share-links` create share token
- `GET /share/{token}` public view

## Payload examples

Create meeting:
```json
{
  "title": "Weekly sync",
  "meeting_date": "2026-01-28",
  "tags": ["product", "roadmap"],
  "folder": "Project Atlas"
}
```

Ask a question:
```json
{
  "question": "What did we decide about launch timing?"
}
```
