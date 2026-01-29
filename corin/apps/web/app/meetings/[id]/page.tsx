import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import MeetingClient from "./MeetingClient";
import { authOptions } from "@/lib/auth";
import { getMeeting } from "@/lib/api";

export default async function MeetingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const meeting = await getMeeting(params.id);
  return (
    <main>
      <section className="hero fade-in">
        <div>
          <span className="pill">Meeting</span>
          <h1 className="hero-title">{meeting.title}</h1>
          <p className="hero-subtitle">
            {meeting.meeting_date ?? "No date"} · {meeting.tags.join(", ") || "No tags"}
          </p>
        </div>
        <div className="card">
          <h3 className="section-title">Status</h3>
          <p className="hero-subtitle">{meeting.status}</p>
          <p className="hero-subtitle">
            {JSON.stringify(meeting.progress_json ?? {})}
          </p>
        </div>
      </section>
      <MeetingClient meeting={meeting} />
    </main>
  );
}
