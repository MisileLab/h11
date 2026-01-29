import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main>
      <section className="hero fade-in">
        <div>
          <span className="pill">Meeting Archive</span>
          <h1 className="hero-title">Corin keeps every meeting searchable.</h1>
          <p className="hero-subtitle">
            Upload long recordings, trim silence with VAD, and get speaker-tagged transcripts
            with searchable summaries and Q&amp;A.
          </p>
          <div style={{ marginTop: "24px" }}>
            <Link className="button" href="/api/auth/signin">
              Sign in with Google
            </Link>
          </div>
        </div>
        <div className="card">
          <h3 className="section-title">What you get</h3>
          <div className="grid">
            <div>
              <strong>Timeline highlights</strong>
              <p className="hero-subtitle">
                Jump to the exact moment decisions were made.
              </p>
            </div>
            <div>
              <strong>Editable transcript</strong>
              <p className="hero-subtitle">
                Fix speaker labels and text while keeping revision history.
              </p>
            </div>
            <div>
              <strong>Scoped Q&amp;A</strong>
              <p className="hero-subtitle">Ask follow-ups with timestamped citations.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
