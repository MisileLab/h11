// API Response Types

export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
}

export interface Folder {
  id: number;
  name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  meeting_count?: number;
}

export interface Meeting {
  id: number;
  title: string;
  description: string | null;
  folder_id: number;
  user_id: number;
  date: number;
  status: 'draft' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  folder?: Folder;
  duration_seconds?: number;
  has_transcript?: boolean;
  has_summary?: boolean;
}

export interface MediaAsset {
  id: number;
  meeting_id: number;
  asset_type: 'original' | 'playback' | 'thumbnail';
  s3_key: string;
  file_size: number;
  mime_type: string;
  duration_seconds: number | null;
  created_at: string;
}

export interface Speaker {
  id: number;
  meeting_id: number;
  speaker_label: string;
  assigned_name: string | null;
  color: string | null;
  created_at: string;
}

export interface TranscriptSegment {
  id: number;
  meeting_id: number;
  speaker_id: number | null;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number | null;
  created_at: string;
  speaker?: Speaker;
}

export interface TranscriptRevision {
  id: number;
  meeting_id: number;
  revision_number: number;
  created_by: number;
  created_at: string;
}

export interface Summary {
  id: number;
  meeting_id: number;
  summary_type: 'work' | 'timeline';
  content: string;
  created_at: string;
}

export interface QAThread {
  id: number;
  meeting_id: number;
  user_id: number;
  question: string;
  created_at: string;
  messages: QAMessage[];
}

export interface QAMessage {
  id: number;
  thread_id: number;
  role: 'user' | 'assistant';
  content: string;
  citations: Array<{
    segment_id: number;
    start_time: number;
    end_time: number;
    text: string;
  }>;
  created_at: string;
}

export interface SearchResult {
  meeting_id: number;
  meeting_title: string;
  folder_name: string;
  segment_id: number;
  text: string;
  start_time: number;
  end_time: number;
  score: number;
}

export interface ShareLink {
  id: number;
  meeting_id: number;
  token: string;
  expires_at: string | null;
  created_at: string;
}

export interface UsageLog {
  id: number;
  user_id: number;
  meeting_id: number | null;
  operation: 'transcription' | 'embedding' | 'chat' | 'summarization';
  cost_usd: number;
  created_at: string;
}

// Request Types
export interface FolderCreate {
  name: string;
  description?: string;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
}

export interface MeetingCreate {
  title: string;
  folder_id: number;
  description?: string;
  date?: number;
}

export interface MeetingUpdate {
  title?: string;
  description?: string;
  date?: number;
}

export interface TranscriptSegmentUpdate {
  text?: string;
  speaker_id?: number;
}

export interface SpeakerUpdate {
  assigned_name?: string;
  color?: string;
}

// API Error
export interface APIError {
  detail: string;
  status: number;
}
