# Embedding Compressor (Ranking-Preserving)

Model-agnostic compressor for float embeddings (R^4096 -> R^{d'}). The objective
prioritizes top-k neighbor/ranking preservation over reconstruction MSE.

## Scope
- Input: float32 embedding matrix (N x D)
- Output: float32 compressed embeddings (N x d')
- Priority: recall@k, NDCG@k, neighbor overlap

## Data Format
- Hugging Face dataset (parquet): default `chaehoyu/wikipedia-22-12-ko-embeddings-100k`
- .npy: array shape (N, D)
- .npz: key "embeddings" or a single array

## Install
```bash
python -m venv .venv
. .venv/bin/activate
pip install -e .
```

## Train
```bash
python train.py --dim-out 64 --k 50 --epochs 20 --max-items 5000
```

Additional training knobs for ranking preservation:
- `--tau`: temperature for listwise distillation (default 0.05)
- `--lambda-list`: weight for listwise KL loss (default 1.0)
- `--hard-neg-l`: teacher top-L pool for hard negatives (default 200)
- `--hard-neg-per-anchor`: negatives per anchor (default 1)
- `--listwise-queue-size`: optional candidate queue size (default 0)

Split metadata is recorded in the model meta block (train/val/test indices),
so results are reproducible across sweeps. The defaults use a 80/10/10 split
with seed 42 and the same 5,000-row subset. For analysis, compare recall@k,
ndcg@k, and neighbor_overlap@k across dim_out values to see how much ranking
signal survives aggressive compression.

Parquet column name is inferred when there is a single column containing
"embedding". If needed, specify it explicitly:

```bash
python train.py --hf-embedding-column embedding --dim-out 64 --k 50
```

If the dataset contains multiple parquet files, specify one:

```bash
python train.py --hf-parquet-file data/train-00000-of-00001.parquet
```

## Evaluate
```bash
python eval.py --model compressor_model.npz --k 50 --max-items 5000
```

## Sweep dim_out
Train + evaluate multiple dimensions and store aggregated results:

```bash
python sweep_dim_out.py --dim-outs 64,32,16 --epochs 20 --max-items 5000
```

Results are stored as JSONL (one line per dim_out) by default, with `metrics`
and `meta` for each run. Use `--output-format json` for a single JSON payload.
Each meta block includes split indices, seed, k, and hyperparameters.

Example output record (abridged):
```json
{"metrics": {"recall@k": 0.61, "ndcg@k": 0.69}, "meta": {"dim_out": 32}}
```

## Benchmark
```bash
python benchmark.py --model compressor_model.npz --max-items 20000
```

To use a local `.npy` file instead of the HF dataset:

```bash
python train.py --input embeddings.npy --dim-out 64 --k 50
```

## Small End-to-End
```bash
python e2e_small.py
```

## Reproducibility
- Seeds are set in training scripts (numpy + torch).
- Configuration is stored in the model metadata and JSON logs.
