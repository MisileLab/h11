import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import DashboardClient from "./DashboardClient";
import { authOptions } from "@/lib/auth";
import { listMeetings } from "@/lib/api";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }
  const meetings = await listMeetings();

  return (
    <main>
      <section className="hero fade-in">
        <div>
          <span className="pill">Dashboard</span>
          <h1 className="hero-title">Your meeting archive.</h1>
          <p className="hero-subtitle">
            Upload new recordings, track processing, and dive into transcripts.
          </p>
        </div>
        <div className="card">
          <h3 className="section-title">Quick actions</h3>
          <div className="grid">
            <Link className="button" href="/upload">
              Upload a meeting
            </Link>
            <Link className="button" href="/api/auth/signout">
              Sign out
            </Link>
          </div>
        </div>
      </section>
      <DashboardClient initial={meetings} />
    </main>
  );
}
