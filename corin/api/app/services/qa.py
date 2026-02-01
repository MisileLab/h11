"""
Q&A service with RAG (Retrieval Augmented Generation).
"""

import logging
from typing import List, Dict, Any, Optional

from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Meeting, QAThread, QAMessage, Embedding, TranscriptSegment

logger = logging.getLogger(__name__)


def retrieve_relevant_context(
    db: Session, meeting_id: int, query: str, top_k: int = 5
) -> List[Dict[str, Any]]:
    """
    Retrieve most relevant transcript segments for a query using vector similarity.

    Args:
        db: Database session
        meeting_id: Meeting ID
        query: Question text
        top_k: Number of top results to retrieve

    Returns:
        List of relevant segments with metadata
    """
    settings = get_settings()

    # Generate embedding for query
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model="text-embedding-3-large", input=[query], encoding_format="float"
    )
    query_embedding = response.data[0].embedding

    # Query for most similar embeddings
    sql = text("""
        SELECT 
            e.chunk_text,
            e.segment_id,
            ts.start_sec,
            ts.end_sec,
            ts.text as full_segment_text,
            s.display_name as speaker_name,
            1 - (e.embedding <=> :query_embedding) as similarity
        FROM embeddings e
        LEFT JOIN transcript_segments ts ON e.segment_id = ts.id
        LEFT JOIN speakers s ON ts.speaker_id = s.id
        WHERE e.meeting_id = :meeting_id
        ORDER BY e.embedding <=> :query_embedding
        LIMIT :top_k
    """)

    result = db.execute(
        sql, {"query_embedding": str(query_embedding), "meeting_id": meeting_id, "top_k": top_k}
    )
    rows = result.fetchall()

    return [
        {
            "text": row.chunk_text,
            "segment_id": row.segment_id,
            "start_sec": row.start_sec,
            "end_sec": row.end_sec,
            "full_text": row.full_segment_text,
            "speaker_name": row.speaker_name,
            "similarity": row.similarity,
        }
        for row in rows
    ]


def format_context_for_prompt(contexts: List[Dict[str, Any]]) -> str:
    """Format retrieved contexts for LLM prompt."""
    formatted = []
    for i, ctx in enumerate(contexts, 1):
        speaker = ctx["speaker_name"] or "Unknown"
        timestamp = f"{ctx['start_sec']:.1f}s" if ctx["start_sec"] else "N/A"
        formatted.append(f"[{i}] [{timestamp}] {speaker}: {ctx['text']}")
    return "\n".join(formatted)


def extract_citations(answer: str, contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract timestamp citations from answer.

    Looks for patterns like [1], [2], etc. and maps them to context segments.

    Args:
        answer: LLM-generated answer
        contexts: Retrieved context segments

    Returns:
        List of citation objects with timestamps
    """
    import re

    citations = []
    pattern = r"\[(\d+)\]"
    matches = re.findall(pattern, answer)

    for match in matches:
        idx = int(match) - 1  # Convert to 0-based index
        if 0 <= idx < len(contexts):
            ctx = contexts[idx]
            citation = {
                "citation_number": idx + 1,
                "segment_id": ctx["segment_id"],
                "start_sec": ctx["start_sec"],
                "end_sec": ctx["end_sec"],
                "text": ctx["text"],
                "speaker_name": ctx["speaker_name"],
            }
            if citation not in citations:
                citations.append(citation)

    return citations


def generate_answer(
    db: Session, meeting_id: int, question: str, thread_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Generate answer to question using RAG.

    Args:
        db: Database session
        meeting_id: Meeting ID
        question: User question
        thread_id: Optional existing thread ID for follow-up questions

    Returns:
        Dict with answer, citations, and thread_id
    """
    settings = get_settings()

    # Get meeting details
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise ValueError(f"Meeting {meeting_id} not found")

    # Retrieve relevant context
    contexts = retrieve_relevant_context(db, meeting_id, question, top_k=5)

    if not contexts:
        return {
            "answer": "I couldn't find any relevant information in this meeting to answer your question.",
            "citations": [],
            "thread_id": thread_id,
        }

    # Format context for prompt
    context_text = format_context_for_prompt(contexts)

    # Get conversation history if thread exists
    conversation_history = []
    if thread_id:
        thread_messages = (
            db.query(QAMessage)
            .filter(QAMessage.thread_id == thread_id)
            .order_by(QAMessage.created_at)
            .all()
        )
        for msg in thread_messages:
            conversation_history.append({"role": msg.role, "content": msg.content})

    # Build prompt
    system_prompt = f"""You are an AI assistant helping users understand their meeting transcripts.

Meeting: {meeting.title}
Date: {meeting.date}

Context from transcript (with timestamps):
{context_text}

Instructions:
- Answer the user's question based ONLY on the provided transcript context
- Cite specific timestamps using [1], [2], etc. format corresponding to the context numbers
- If the answer isn't in the context, say so
- Be concise and accurate
- Use speaker names when relevant"""

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history
    messages.extend(conversation_history)

    # Add current question
    messages.append({"role": "user", "content": question})

    # Call OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model="gpt-5-mini", messages=messages, temperature=0.7, max_tokens=500
    )

    answer = response.choices[0].message.content
    usage = response.usage

    # Extract citations
    citations = extract_citations(answer, contexts)

    # Create or get thread
    if not thread_id:
        thread = QAThread(meeting_id=meeting_id)
        db.add(thread)
        db.flush()
        thread_id = thread.id

    # Save question
    question_msg = QAMessage(thread_id=thread_id, role="user", content=question)
    db.add(question_msg)

    # Save answer
    answer_msg = QAMessage(
        thread_id=thread_id,
        role="assistant",
        content=answer,
        citations_json={"citations": citations},
    )
    db.add(answer_msg)

    # TODO: Track cost
    # cost = calculate_openai_cost(usage, "gpt-5-mini")

    db.commit()

    logger.info(
        f"Generated Q&A answer for meeting {meeting_id}, thread {thread_id}: "
        f"{usage.total_tokens} tokens"
    )

    return {
        "answer": answer,
        "citations": citations,
        "thread_id": thread_id,
        "usage": {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "total_tokens": usage.total_tokens,
        },
    }
