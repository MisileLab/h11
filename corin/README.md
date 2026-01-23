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
