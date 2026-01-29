import { getShare } from "@/lib/api";

export default async function SharePage({ params }: { params: { token: string } }) {
  const meeting = await getShare(params.token);
  const workSummary = meeting.summaries.find((summary) => summary.kind === "work");
  const timelineSummary = meeting.summaries.find((summary) => summary.kind === "timeline");

  return (
    <main>
      <section className="hero fade-in">
        <div>
          <span className="pill">Shared meeting</span>
          <h1 className="hero-title">{meeting.title}</h1>
          <p className="hero-subtitle">
            {meeting.meeting_date ?? "No date"} · {meeting.tags.join(", ") || "No tags"}
          </p>
        </div>
        <div className="card">
          <h3 className="section-title">Playback</h3>
          {meeting.playable_url ? (
            <audio controls src={meeting.playable_url} style={{ width: "100%" }}>
              <track kind="captions" src="data:text/vtt,WEBVTT" />
            </audio>
          ) : (
            <p className="hero-subtitle">Audio is still processing.</p>
          )}
        </div>
      </section>
      <section className="grid two">
        <div className="card">
          <h3 className="section-title">Summary (Work)</h3>
          <pre style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>
            {JSON.stringify(workSummary?.content_json ?? {}, null, 2)}
          </pre>
        </div>
        <div className="card">
          <h3 className="section-title">Summary (Timeline)</h3>
          <pre style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>
            {JSON.stringify(timelineSummary?.content_json ?? {}, null, 2)}
          </pre>
        </div>
      </section>
      <section className="card">
        <h3 className="section-title">Transcript</h3>
        <div className="grid">
          {meeting.transcript_segments.map((segment) => (
            <div key={segment.id} className="card" style={{ background: "rgba(9, 17, 19, 0.75)" }}>
              <strong>{segment.speaker_key}</strong>
              <p className="hero-subtitle">
                {Math.floor(segment.start_ms / 1000)}s - {Math.floor(segment.end_ms / 1000)}s
              </p>
              <p>{segment.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
