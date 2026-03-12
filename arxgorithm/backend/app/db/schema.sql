-- arXgorithm SQLite Schema
-- Initialize with sqlite-vec for vector search

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Papers table: core metadata from arXiv
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arxiv_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  authors JSON NOT NULL,  -- JSON array of author names
  categories JSON NOT NULL,  -- JSON array of category strings
  published_at INTEGER NOT NULL,  -- Unix timestamp (integer seconds)
  updated_at INTEGER NOT NULL,  -- Unix timestamp
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Embeddings table: 1024-dim vectors via sqlite-vec
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
  id INTEGER PRIMARY KEY,
  embedding float[1024]
);

-- Papers to embeddings relationship (for FTS integration)
CREATE TABLE IF NOT EXISTS paper_embeddings (
  paper_id INTEGER NOT NULL PRIMARY KEY,
  embedding_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

-- Users table: OAuth users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oauth_provider TEXT NOT NULL,  -- "google" or "github"
  oauth_id TEXT NOT NULL,  -- External user ID from provider
  email TEXT,
  name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(oauth_provider, oauth_id)
);

-- Reading list: papers saved by users (or anonymous users)
CREATE TABLE IF NOT EXISTS reading_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,  -- NULL for anonymous users
  anonymous_id TEXT,  -- Cookie UUID for anonymous users
  paper_id INTEGER NOT NULL,
  saved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  UNIQUE(user_id, paper_id),
  UNIQUE(anonymous_id, paper_id)
);

-- Anonymous sessions: track cookie-based users
CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cookie_uuid TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Embedding cache: text hash -> embedding vector with TTL
CREATE TABLE IF NOT EXISTS embedding_cache (
  text_hash TEXT PRIMARY KEY,
  embedding_vector BLOB NOT NULL,  -- Binary encoded floats (struct.pack format)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_published_at ON papers(published_at);
CREATE INDEX IF NOT EXISTS idx_reading_list_user_id ON reading_list(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_anonymous_id ON reading_list(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_paper_id ON reading_list(paper_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_cookie ON anonymous_sessions(cookie_uuid);
