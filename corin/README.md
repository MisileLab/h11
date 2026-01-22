# Embedding Compressor (Ranking-Preserving)

Model-agnostic compressor for float embeddings (R^4096 -> R^{d'}). The objective
prioritizes top-k neighbor/ranking preservation over reconstruction MSE.

## Scope
- Input: float32 embedding matrix (N x D)
- Output: float32 compressed embeddings (N x d')
- Priority: recall@k, NDCG@k, neighbor overlap

## Data Format
- .npy: array shape (N, D)
- .npz: key "embeddings" or a single array

## Install
```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Train
```bash
python train.py --input embeddings.npy --dim-out 64 --k 50 --epochs 20
```

## Evaluate
```bash
python eval.py --input embeddings.npy --model compressor_model.npz --k 50
```

## Benchmark
```bash
python benchmark.py --input embeddings.npy --model compressor_model.npz
```

## Small End-to-End
```bash
python e2e_small.py
```

## Reproducibility
- Seeds are set in training scripts (numpy + torch).
- Configuration is stored in the model metadata and JSON logs.
