const runtimeApiUrl =
  typeof window !== "undefined" ? window.__env?.NEXT_PUBLIC_API_URL : undefined;
const PUBLIC_API_URL =
  runtimeApiUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const INTERNAL_API_URL = process.env.API_INTERNAL_URL;
const API_URL =
  typeof window === "undefined" && INTERNAL_API_URL ? INTERNAL_API_URL : PUBLIC_API_URL;

export type Meeting = {
  id: string;
  title: string;
  meeting_date: string | null;
  tags: string[];
  folder: string | null;
  status: string;
  stt_provider: string | null;
  stt_audio_tokens: number | null;
  stt_input_text_tokens: number | null;
  stt_output_tokens: number | null;
  stt_cost_usd: number | null;
  progress_json: Record<string, unknown>;
  created_at: string;
};

export type TranscriptSegment = {
  id: string;
  start_ms: number;
  end_ms: number;
  speaker_key: string;
  text: string;
};

export type Summary = {
  id: string;
  kind: string;
  content_json: Record<string, unknown>;
  created_at: string;
};

export type QaResponse = {
  answer: string;
  citations: {
    segment_id: string;
    start_ms: number;
    end_ms: number;
    text: string;
  }[];
};

export type ShareLink = {
  id: string;
  token: string;
  created_at: string;
};

export type MeetingDetail = Meeting & {
  transcript_segments: TranscriptSegment[];
  summaries: Summary[];
  speaker_labels: { id: string; speaker_key: string; display_name: string }[];
  share_links: { id: string; token: string }[];
  playable_url: string | null;
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listMeetings(query?: string): Promise<Meeting[]> {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch<Meeting[]>(`/meetings${q}`);
}

export async function createMeeting(payload: {
  title: string;
  meeting_date?: string | null;
  tags?: string[];
  folder?: string | null;
}): Promise<Meeting> {
  return apiFetch<Meeting>("/meetings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadMeetingFile(meetingId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_URL}/meetings/${meetingId}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Upload failed ${response.status}`);
  }
  return response.json();
}

export async function getMeeting(meetingId: string): Promise<MeetingDetail> {
  return apiFetch<MeetingDetail>(`/meetings/${meetingId}`);
}

export async function updateSegment(
  segmentId: string,
  text: string
): Promise<TranscriptSegment> {
  return apiFetch<TranscriptSegment>(`/segments/${segmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

export async function renameSpeaker(meetingId: string, speakerKey: string, displayName: string) {
  return apiFetch(`/meetings/${meetingId}/speakers/${speakerKey}`, {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function regenerateSummary(meetingId: string) {
  return apiFetch(`/meetings/${meetingId}/summaries/regenerate`, { method: "POST" });
}

export async function askQuestion(
  meetingId: string,
  question: string
): Promise<QaResponse> {
  return apiFetch<QaResponse>(`/meetings/${meetingId}/qa`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function createShareLink(meetingId: string): Promise<ShareLink> {
  return apiFetch<ShareLink>(`/meetings/${meetingId}/share-links`, { method: "POST" });
}

export async function getShare(token: string): Promise<MeetingDetail> {
  return apiFetch(`/share/${token}`);
}
