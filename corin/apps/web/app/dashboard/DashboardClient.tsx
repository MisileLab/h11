"use client";

import { useMemo, useState, type ChangeEvent } from "react";

import { listMeetings, type Meeting } from "@/lib/api";

export default function DashboardClient({ initial }: { initial: Meeting[] }) {
  const [query, setQuery] = useState("");
  const [meetings, setMeetings] = useState(initial);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => meetings, [meetings]);

  const runSearch = async () => {
    setLoading(true);
    try {
      const result = await listMeetings(query);
      setMeetings(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid">
      <div className="card">
        <div className="grid two">
          <div>
            <label className="label" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              className="input"
              placeholder="Search transcripts, summaries, titles"
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setQuery(event.target.value)
              }
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              className="button"
              type="button"
              onClick={runSearch}
              disabled={loading}
            >
              {loading ? "Searching" : "Search"}
            </button>
          </div>
        </div>
      </div>
      <div className="grid two">
        {filtered
          .filter((meeting) => meeting.id && meeting.id !== "undefined")
          .map((meeting) => (
            <a key={meeting.id} href={`/meetings/${meeting.id}`} className="card fade-in">
              <span className="pill">{meeting.status}</span>
              <h3 style={{ marginTop: "12px" }}>{meeting.title}</h3>
              <p className="hero-subtitle">
                {meeting.meeting_date ?? "No date"} · {meeting.tags.join(", ") || "No tags"}
              </p>
            </a>
          ))}
      </div>
    </div>
  );
}
