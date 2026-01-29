"use client";

import { useMemo, useState, type ChangeEvent } from "react";

import {
  askQuestion,
  createShareLink,
  regenerateSummary,
  renameSpeaker,
  updateSegment,
  type MeetingDetail,
  type TranscriptSegment,
} from "@/lib/api";

export default function MeetingClient({ meeting }: { meeting: MeetingDetail }) {
  const [segments, setSegments] = useState<TranscriptSegment[]>(meeting.transcript_segments);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [speakerKey, setSpeakerKey] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const workSummary = useMemo(
    () => meeting.summaries.find((summary) => summary.kind === "work"),
    [meeting.summaries]
  );
  const timelineSummary = useMemo(
    () => meeting.summaries.find((summary) => summary.kind === "timeline"),
    [meeting.summaries]
  );

  const startEdit = (segment: TranscriptSegment) => {
    setEditingId(segment.id);
    setDraft(segment.text);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const updated = await updateSegment(editingId, draft);
    setSegments((prev: TranscriptSegment[]) =>
      prev.map((segment: TranscriptSegment) =>
        segment.id === editingId ? updated : segment
      )
    );
    setEditingId(null);
  };

  const handleSpeakerRename = async () => {
    if (!speakerKey || !speakerName) return;
    await renameSpeaker(meeting.id, speakerKey, speakerName);
    setSpeakerKey("");
    setSpeakerName("");
  };

  const handleQuestion = async () => {
    if (!question) return;
    const response = await askQuestion(meeting.id, question);
    setAnswer(response.answer);
  };

  const handleShare = async () => {
    const share = await createShareLink(meeting.id);
    setShareToken(share.token);
  };

  return (
    <div className="grid">
      <div className="grid two">
        <div className="card">
          <h3 className="section-title">Playback</h3>
          {meeting.playable_url ? (
            <audio controls src={meeting.playable_url} style={{ width: "100%" }}>
              <track kind="captions" src="data:text/vtt,WEBVTT" />
            </audio>
          ) : (
            <div>
              <p className="hero-subtitle">Audio is still processing.</p>
              {meeting.status === "vad" && (
                <p className="hero-subtitle" style={{ marginTop: "8px", fontSize: "0.9em" }}>
                  Current step: VAD
                </p>
              )}
              {meeting.status === "transcribing" && (
                <p className="hero-subtitle" style={{ marginTop: "8px", fontSize: "0.9em" }}>
                  Current step: Transcribing
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="section-title">Cost & Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <strong>Provider</strong>
              <p className="hero-subtitle">{meeting.stt_provider || "—"}</p>
            </div>
            <div>
              <strong>Cost</strong>
              <p className="hero-subtitle">
                {meeting.stt_cost_usd !== null ? `$${meeting.stt_cost_usd.toFixed(4)}` : "—"}
              </p>
            </div>
          </div>
          {(meeting.stt_audio_tokens !== null ||
            meeting.stt_input_text_tokens !== null ||
            meeting.stt_output_tokens !== null) && (
            <div style={{ marginTop: "12px" }}>
              <strong>Tokens</strong>
              <p className="hero-subtitle" style={{ fontSize: "0.9em" }}>
                {[
                  meeting.stt_audio_tokens && `${meeting.stt_audio_tokens} audio`,
                  meeting.stt_input_text_tokens && `${meeting.stt_input_text_tokens} in`,
                  meeting.stt_output_tokens && `${meeting.stt_output_tokens} out`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3 className="section-title">Summary (Work)</h3>
          <pre style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>
            {JSON.stringify(workSummary?.content_json ?? {}, null, 2)}
          </pre>
          <button className="button" type="button" onClick={() => regenerateSummary(meeting.id)}>
            Regenerate summary
          </button>
        </div>
        <div className="card">
          <h3 className="section-title">Summary (Timeline)</h3>
          <pre style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>
            {JSON.stringify(timelineSummary?.content_json ?? {}, null, 2)}
          </pre>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Transcript</h3>
        <div className="grid">
          {segments.map((segment) => (
            <div key={segment.id} className="card" style={{ background: "rgba(9, 17, 19, 0.75)" }}>
              <strong>{segment.speaker_key}</strong>
              <p className="hero-subtitle">
                {Math.floor(segment.start_ms / 1000)}s - {Math.floor(segment.end_ms / 1000)}s
              </p>
              {editingId === segment.id ? (
                <div className="grid">
                  <textarea
                    className="textarea"
                    value={draft}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setDraft(event.target.value)
                    }
                  />
                  <button className="button" type="button" onClick={saveEdit}>
                    Save edit
                  </button>
                </div>
              ) : (
                <>
                  <p>{segment.text}</p>
                  <button className="button" type="button" onClick={() => startEdit(segment)}>
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3 className="section-title">Rename speaker</h3>
          <label className="label" htmlFor="speakerKey">
            Speaker key
          </label>
          <input
            id="speakerKey"
            className="input"
            value={speakerKey}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSpeakerKey(event.target.value)
            }
            placeholder="spk_1"
          />
          <label className="label" htmlFor="speakerName" style={{ marginTop: "12px" }}>
            Display name
          </label>
          <input
            id="speakerName"
            className="input"
            value={speakerName}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSpeakerName(event.target.value)
            }
            placeholder="Alex"
          />
          <div style={{ marginTop: "12px" }}>
            <button className="button" type="button" onClick={handleSpeakerRename}>
              Update speaker
            </button>
          </div>
        </div>
        <div className="card">
          <h3 className="section-title">Share</h3>
          <p className="hero-subtitle">
            Create a private link for this meeting.
          </p>
          <button className="button" type="button" onClick={handleShare}>
            Create share link
          </button>
          {shareToken && (
            <p className="hero-subtitle" style={{ marginTop: "12px" }}>
              Share URL: /share/{shareToken}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Q&amp;A</h3>
        <label className="label" htmlFor="question">
          Ask a question
        </label>
        <input
          id="question"
          className="input"
          value={question}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setQuestion(event.target.value)
          }
          placeholder="What did we decide about launch timing?"
        />
        <div style={{ marginTop: "12px" }}>
          <button className="button" type="button" onClick={handleQuestion}>
            Ask
          </button>
        </div>
        {answer && (
          <div style={{ marginTop: "16px" }}>
            <strong>Answer</strong>
            <p className="hero-subtitle">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
