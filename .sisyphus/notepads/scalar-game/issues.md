## 2026-02-10 session hygiene

- Observed corrupted subagent continuation session: `ses_3b80ee40effeBobM5LINukb4H5` returning `JSON Parse error: Unexpected EOF`.
- Mitigation applied: removed reliance on that session and canceled all stale background task runs.
- Verification: active `boulder.json` session IDs are valid (`session_info` checked for all entries).
