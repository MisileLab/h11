<!-- Parent: ../../AGENTS.md -->
# WORKER

## OVERVIEW
RQ worker process for Corin background jobs.

## STRUCTURE
```
apps/worker/
├── worker.py
├── tools/
└── requirements.txt
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Worker entry | `worker.py` | RQ worker loop |
| Tools | `tools` | One-off utilities |
| VAD audit | `tools/vad_audit.py` | Audio tooling |

## CONVENTIONS
- Worker consumes tasks enqueued by the API.
- Keep operational tools under `tools/`.
