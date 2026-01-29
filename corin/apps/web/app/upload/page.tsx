"use client";

import { useState, type ChangeEvent } from "react";

import { createMeeting, uploadMeetingFile } from "@/lib/api";

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [tags, setTags] = useState("");
  const [folder, setFolder] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const submit = async () => {
    if (!file) {
      setStatus("Select a file to upload.");
      return;
    }
    setStatus("Creating meeting...");
    const meeting = await createMeeting({
      title,
      meeting_date: date || null,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      folder: folder || null,
    });
    if (!meeting?.id) {
      setStatus("Upload failed: meeting id missing.");
      return;
    }
    setStatus("Uploading file...");
    await uploadMeetingFile(meeting.id, file);
    setStatus("Upload complete. Processing started.");
  };

  return (
    <main>
      <section className="hero fade-in">
        <div>
          <span className="pill">Upload</span>
          <h1 className="hero-title">Bring in a new recording.</h1>
          <p className="hero-subtitle">
            Corin will extract audio, remove silence, and start transcription.
          </p>
        </div>
        <div className="card">
          <h3 className="section-title">Upload status</h3>
          <p className="hero-subtitle">{status ?? "Waiting for input"}</p>
        </div>
      </section>
      <section className="card">
        <div className="grid two">
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input
              id="title"
              className="input"
              value={title}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setTitle(event.target.value)
              }
              placeholder="Weekly sync"
            />
          </div>
          <div>
            <label className="label" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              className="input"
              type="date"
              value={date}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDate(event.target.value)
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="tags">
              Tags
            </label>
            <input
              id="tags"
              className="input"
              value={tags}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setTags(event.target.value)
              }
              placeholder="product, roadmap"
            />
          </div>
          <div>
            <label className="label" htmlFor="folder">
              Folder
            </label>
            <input
              id="folder"
              className="input"
              value={folder}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setFolder(event.target.value)
              }
              placeholder="Project Atlas"
            />
          </div>
        </div>
        <div style={{ marginTop: "20px" }}>
          <label className="label" htmlFor="file">
            Recording file
          </label>
          <input
            id="file"
            className="input"
            type="file"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFile(event.target.files?.[0] ?? null)
            }
          />
        </div>
        <div style={{ marginTop: "24px" }}>
          <button className="button" type="button" onClick={submit}>
            Start upload
          </button>
        </div>
      </section>
    </main>
  );
}
