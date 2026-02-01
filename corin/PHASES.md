# Corin Implementation Phases

**Project**: Meeting Archive & Transcription System  
**Status**: Phase 0 Complete (Infrastructure) → Starting Phase 1  
**Last Updated**: 2026-02-01

---

## ✅ Phase 0: Foundation & Infrastructure (COMPLETE)

**Goal**: Set up project scaffolding, database, and core services.

### Completed Tickets

- [x] **0.1** Project scaffolding (FastAPI + Next.js + Docker Compose)
- [x] **0.2** Database setup (PostgreSQL + pgvector + Alembic migrations)
- [x] **0.3** S3/MinIO configuration (presigned URLs, file operations)
- [x] **0.4** Redis & RQ worker setup (job queues, status tracking)

### Deliverables

- Docker Compose with Postgres, Redis, MinIO
- 14 database tables (users, meetings, transcripts, etc.)
- S3/MinIO utility module with file operations
- RQ worker infrastructure with 4 queues
- All tests passing for MinIO and Redis connectivity

---

## 🟡 Phase 1: Authentication & Core APIs (IN PROGRESS)

**Goal**: Implement user authentication and basic CRUD operations for folders/meetings.

### Tickets

#### 1.1 Google OAuth Backend
- [ ] Create `api/app/routes/auth.py` with OAuth flow endpoints
- [ ] Implement `api/app/services/auth.py` with Google token validation
- [ ] JWT token generation and refresh logic
- [ ] User creation/update on successful OAuth
- [ ] Auth dependency for route protection

**Files**: `app/routes/auth.py`, `app/services/auth.py`, `app/dependencies/auth.py`

#### 1.2 Auth Middleware & Dependencies
- [ ] JWT token validation dependency
- [ ] Current user injection for protected routes
- [ ] Permission checking utilities
- [ ] Middleware for token refresh

**Files**: `app/dependencies/auth.py`, `app/middleware/auth.py`

#### 1.3 Next.js Auth Integration
- [ ] NextAuth.js configuration
- [ ] Google OAuth provider setup
- [ ] Session management
- [ ] Auth context provider
- [ ] Protected route wrapper

**Files**: `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/lib/auth.ts`, `web/src/providers/AuthProvider.tsx`

#### 1.4 Folders CRUD API
- [ ] POST /api/folders - Create folder
- [ ] GET /api/folders - List user's folders
- [ ] GET /api/folders/{id} - Get folder details
- [ ] PUT /api/folders/{id} - Update folder
- [ ] DELETE /api/folders/{id} - Delete folder (soft delete)
- [ ] Ownership validation

**Files**: `app/routes/folders.py`, `app/services/folders.py`

#### 1.5 Meetings CRUD API
- [ ] POST /api/meetings - Create meeting
- [ ] GET /api/meetings - List meetings (with filters)
- [ ] GET /api/meetings/{id} - Get meeting details
- [ ] PUT /api/meetings/{id} - Update meeting metadata
- [ ] DELETE /api/meetings/{id} - Delete meeting (soft delete)
- [ ] Folder association validation

**Files**: `app/routes/meetings.py`, `app/services/meetings.py`

### Acceptance Criteria

- ✅ Users can sign in with Google OAuth
- ✅ JWT tokens are issued and validated correctly
- ✅ Users can create/read/update/delete folders
- ✅ Users can create/read/update/delete meetings
- ✅ All endpoints require authentication
- ✅ Users can only access their own resources

---

## 🔜 Phase 2: File Upload & Processing Pipeline

**Goal**: Handle audio/video uploads, VAD processing, and file storage.

### Tickets

#### 2.1 Upload Endpoints
- [ ] POST /api/meetings/{id}/upload/request - Request presigned upload URL
- [ ] POST /api/meetings/{id}/upload/complete - Confirm upload completion
- [ ] File size validation
- [ ] Content type validation (audio/video only)
- [ ] MediaAsset record creation

**Files**: `app/routes/upload.py`, `app/services/upload.py`

#### 2.2 VAD Worker Job
- [ ] Create `app/workers/tasks/vad.py`
- [ ] Silero VAD implementation
- [ ] Audio format conversion (FFmpeg)
- [ ] VADSegment record creation
- [ ] Progress tracking via JobProgress
- [ ] Error handling and retry logic

**Files**: `app/workers/tasks/vad.py`, `app/services/vad.py`

#### 2.3 Audio Processing Pipeline
- [ ] Download from S3/MinIO
- [ ] Extract audio track from video
- [ ] Resample to 16kHz mono
- [ ] Generate playback version (64kbps)
- [ ] Upload playback to S3
- [ ] Update MediaAsset records

**Files**: `app/workers/tasks/audio_processing.py`, `app/services/audio.py`

#### 2.4 Processing Status API
- [ ] GET /api/meetings/{id}/status - Get processing status
- [ ] WebSocket endpoint for real-time updates (optional)
- [ ] Progress percentage calculation
- [ ] Stage tracking (upload → VAD → transcription → complete)

**Files**: `app/routes/meetings.py`, `app/services/processing_status.py`

### Acceptance Criteria

- ✅ Users can upload audio/video files up to 2GB
- ✅ Files are stored in S3/MinIO
- ✅ VAD detects speech segments accurately
- ✅ Playback audio is generated at 64kbps
- ✅ Processing status updates in real-time
- ✅ Failed uploads can be retried

---

## 🔜 Phase 3: Transcription & AI Features

**Goal**: Implement OpenAI transcription, speaker diarization, and summarization.

### Tickets

#### 3.1 Transcription Worker Job
- [ ] Create `app/workers/tasks/transcription.py`
- [ ] OpenAI Whisper API integration
- [ ] Chunk audio files (max 24MB per chunk)
- [ ] Merge chunk results
- [ ] Create Speaker and TranscriptSegment records
- [ ] Cost tracking (STTUsageLog)

**Files**: `app/workers/tasks/transcription.py`, `app/services/transcription.py`

#### 3.2 Speaker Diarization
- [ ] OpenAI diarization model integration
- [ ] Speaker embedding generation
- [ ] Automatic speaker grouping
- [ ] Manual speaker name assignment
- [ ] Speaker color assignment for UI

**Files**: `app/services/diarization.py`

#### 3.3 Transcript Editing API
- [ ] GET /api/meetings/{id}/transcript - Get current transcript
- [ ] PUT /api/meetings/{id}/transcript/segments/{id} - Edit segment
- [ ] POST /api/meetings/{id}/transcript/revisions - Create revision
- [ ] GET /api/meetings/{id}/transcript/revisions - List revisions
- [ ] Revision comparison endpoint

**Files**: `app/routes/transcript.py`, `app/services/transcript.py`

#### 3.4 AI Summarization Worker
- [ ] Create `app/workers/tasks/summarization.py`
- [ ] Work-focused summary generation
- [ ] Timeline-based summary generation
- [ ] Summary record creation
- [ ] Cost tracking

**Files**: `app/workers/tasks/summarization.py`, `app/services/summarization.py`

#### 3.5 Summarization API
- [ ] POST /api/meetings/{id}/summaries - Request new summary
- [ ] GET /api/meetings/{id}/summaries - List summaries
- [ ] DELETE /api/meetings/{id}/summaries/{id} - Delete summary

**Files**: `app/routes/summaries.py`

### Acceptance Criteria

- ✅ Audio files are transcribed accurately
- ✅ Speakers are identified and diarized
- ✅ Users can edit transcript segments
- ✅ Transcript revisions are tracked
- ✅ AI summaries are generated (work-focused & timeline)
- ✅ OpenAI API costs are tracked per meeting

---

## 🔜 Phase 4: Q&A, Search, & Embeddings

**Goal**: Implement RAG-based Q&A and full-text search.

### Tickets

#### 4.1 Embedding Generation Worker
- [ ] Create `app/workers/tasks/embeddings.py`
- [ ] OpenAI text-embedding-3-small integration
- [ ] Chunk transcript segments (overlap strategy)
- [ ] Generate embeddings for all chunks
- [ ] Store in Embedding table (pgvector)
- [ ] Cost tracking

**Files**: `app/workers/tasks/embeddings.py`, `app/services/embeddings.py`

#### 4.2 Search API
- [ ] POST /api/search - Full-text + vector search
- [ ] Hybrid search (BM25 + cosine similarity)
- [ ] Result ranking and deduplication
- [ ] Timestamp citation extraction
- [ ] Filters (date range, folder, meeting)

**Files**: `app/routes/search.py`, `app/services/search.py`

#### 4.3 Q&A Thread API
- [ ] POST /api/meetings/{id}/qa - Ask question
- [ ] GET /api/meetings/{id}/qa - List Q&A threads
- [ ] GET /api/meetings/{id}/qa/{thread_id} - Get thread with messages
- [ ] RAG retrieval with timestamp citations
- [ ] Streaming response support (optional)

**Files**: `app/routes/qa.py`, `app/services/qa.py`

#### 4.4 Q&A Worker Job
- [ ] Create `app/workers/tasks/qa.py`
- [ ] Vector similarity search for context
- [ ] OpenAI chat completion with context
- [ ] Citation extraction from transcript
- [ ] QAMessage record creation
- [ ] Cost tracking

**Files**: `app/workers/tasks/qa.py`

### Acceptance Criteria

- ✅ Embeddings are generated for all transcripts
- ✅ Users can search across all meetings
- ✅ Search returns relevant results with timestamps
- ✅ Users can ask questions about meetings
- ✅ Q&A answers include timestamp citations
- ✅ Costs are tracked for embeddings and chat

---

## 🔜 Phase 5: Frontend UI & User Experience

**Goal**: Build complete Next.js frontend with all features.

### Tickets

#### 5.1 API Client Library
- [ ] Create `web/src/lib/api.ts` with typed fetch wrappers
- [ ] Axios/fetch configuration
- [ ] Auth token injection
- [ ] Error handling and retry logic
- [ ] TypeScript types generation from OpenAPI

**Files**: `web/src/lib/api.ts`, `web/src/types/api.ts`

#### 5.2 Authentication UI
- [ ] Landing page with Google Sign In button
- [ ] Auth callback page
- [ ] Session management
- [ ] Protected route HOC
- [ ] User profile dropdown

**Files**: `web/src/app/page.tsx`, `web/src/app/auth/callback/page.tsx`, `web/src/components/auth/`

#### 5.3 Dashboard & Folder Management
- [ ] Dashboard page listing folders
- [ ] Create/edit/delete folder dialogs
- [ ] Folder grid/list view toggle
- [ ] Empty states

**Files**: `web/src/app/dashboard/page.tsx`, `web/src/components/folders/`

#### 5.4 Meetings List & Upload
- [ ] Meetings list page (per folder)
- [ ] Upload dialog with drag & drop
- [ ] Upload progress indicator
- [ ] Processing status badges
- [ ] Meeting card component

**Files**: `web/src/app/folders/[id]/page.tsx`, `web/src/components/meetings/`, `web/src/components/upload/`

#### 5.5 Meeting Detail Page
- [ ] Meeting detail page with tabs
- [ ] Transcript viewer with timestamps
- [ ] Audio player synced with transcript
- [ ] Inline transcript editing
- [ ] Speaker name assignment
- [ ] Summary display (work-focused & timeline)

**Files**: `web/src/app/meetings/[id]/page.tsx`, `web/src/components/transcript/`, `web/src/components/player/`

#### 5.6 Q&A Interface
- [ ] Q&A tab in meeting detail
- [ ] Question input with submit button
- [ ] Thread list display
- [ ] Answer display with citations
- [ ] Click citation to jump to timestamp

**Files**: `web/src/components/qa/`

#### 5.7 Search Interface
- [ ] Global search bar in header
- [ ] Search results page
- [ ] Result cards with snippets and timestamps
- [ ] Filters (date, folder, meeting)
- [ ] Jump to meeting from result

**Files**: `web/src/app/search/page.tsx`, `web/src/components/search/`

### Acceptance Criteria

- ✅ Users can sign in and see dashboard
- ✅ Users can create/manage folders
- ✅ Users can upload audio/video files
- ✅ Users can view processing status
- ✅ Users can read/edit transcripts
- ✅ Users can play audio synced with transcript
- ✅ Users can view AI summaries
- ✅ Users can ask questions and see answers
- ✅ Users can search across all meetings
- ✅ UI is responsive and polished

---

## 🔜 Phase 6: Sharing & Polish

**Goal**: Add public sharing, cost monitoring, and final polish.

### Tickets

#### 6.1 Share Links API
- [ ] POST /api/meetings/{id}/share - Create share link
- [ ] GET /api/share/{token} - Get shared meeting (public)
- [ ] DELETE /api/meetings/{id}/share/{id} - Revoke share link
- [ ] Expiration support
- [ ] Password protection (optional)

**Files**: `app/routes/share.py`, `app/services/share.py`

#### 6.2 Share UI
- [ ] Share dialog with link generation
- [ ] Public meeting view page
- [ ] Copy link button
- [ ] Expiration settings
- [ ] Access stats (optional)

**Files**: `web/src/app/share/[token]/page.tsx`, `web/src/components/share/`

#### 6.3 Usage & Cost Tracking UI
- [ ] Usage dashboard page
- [ ] Cost breakdown by meeting
- [ ] Cost breakdown by operation (STT, embedding, chat)
- [ ] Date range filters
- [ ] Export to CSV

**Files**: `web/src/app/usage/page.tsx`, `web/src/components/usage/`

#### 6.4 Settings Page
- [ ] User profile settings
- [ ] API key management (optional)
- [ ] Email notifications settings
- [ ] Delete account

**Files**: `web/src/app/settings/page.tsx`

#### 6.5 Polish & Bug Fixes
- [ ] Loading states for all async operations
- [ ] Error boundaries and fallbacks
- [ ] Toast notifications for actions
- [ ] Keyboard shortcuts
- [ ] Mobile responsive tweaks
- [ ] Performance optimization
- [ ] Accessibility audit (WCAG)

### Acceptance Criteria

- ✅ Users can create shareable public links
- ✅ Public links work without authentication
- ✅ Users can view usage and costs
- ✅ Users can export cost data
- ✅ Settings page is complete
- ✅ All major bugs fixed
- ✅ UI is polished and responsive
- ✅ Basic accessibility compliance

---

## 📊 Progress Tracking

| Phase | Status | Tickets | Completion |
|-------|--------|---------|------------|
| Phase 0 | ✅ Complete | 4/4 | 100% |
| Phase 1 | 🟡 In Progress | 0/5 | 0% |
| Phase 2 | ⏳ Pending | 0/4 | 0% |
| Phase 3 | ⏳ Pending | 0/5 | 0% |
| Phase 4 | ⏳ Pending | 0/4 | 0% |
| Phase 5 | ⏳ Pending | 0/7 | 0% |
| Phase 6 | ⏳ Pending | 0/5 | 0% |

**Total**: 4/34 tickets complete (12%)

---

## 🚀 Quick Start (for new developers)

1. **Current State**: Phase 0 complete. Infrastructure is running.
2. **Next Up**: Implement Phase 1 (Authentication & Core APIs)
3. **Start Here**: Create `api/app/routes/auth.py` and implement Google OAuth flow

### Running the Project

```bash
# Start services
cd corin
docker-compose up -d

# Start API
cd api
poetry install
poetry run python -m app.main

# Start frontend
cd web
npm install
npm run dev

# Start worker
cd api
poetry run python worker.py
```

### Development Workflow

1. Pick a ticket from the current phase
2. Create necessary files (routes, services, workers)
3. Write tests (unit + integration)
4. Test manually via API docs or frontend
5. Mark ticket complete
6. Move to next ticket

---

## 📝 Notes

- **Phase ordering**: Phases must be completed in order (1 → 6)
- **Ticket flexibility**: Within a phase, tickets can be done in parallel or reordered
- **Testing**: Each ticket should include tests before marking complete
- **Documentation**: Update API docs and frontend README as features are added
- **Production**: Phase 6 completion = MVP ready for production deployment
