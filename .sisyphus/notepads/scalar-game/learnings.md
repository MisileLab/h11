## 2026-02-10 operational learnings

- Keep `boulder.json` as the single source of truth for active plan and session IDs.
- When a continuation session repeatedly returns `Unexpected EOF`, retrying same `session_id` is ineffective; start a fresh delegation session.
- Cancel lingering background tasks before resuming plan execution to avoid noisy cross-session state.
