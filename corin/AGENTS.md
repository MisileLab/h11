<!-- Parent: ../AGENTS.md -->
# CORIN

## OVERVIEW
Python embedding compressor focused on ranking-preserving compression.

## STRUCTURE
```
corin/
├── train.py         # Training entry point
├── compressor.py    # Core model logic
├── eval.py          # Evaluation utilities
├── metrics.py       # Ranking metrics
├── data.py          # Data loading helpers
├── test_*.py         # Pytest tests
├── pyproject.toml   # Dependencies + metadata
└── uv.lock          # Locked deps
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Model logic | `compressor.py` | Core compressor |
| Training | `train.py` | CLI training entry |
| Evaluation | `eval.py` | Validation utilities |
| Metrics | `metrics.py` | Recall/NDCG helpers |
| Tests | `test_compressor.py`, `test_metrics.py` | Pytest |
| Dependencies | `pyproject.toml` | Python >=3.14 |

## CONVENTIONS
- Python >=3.14, dependencies pinned in `pyproject.toml`.
- Lockfile managed in `uv.lock`.
