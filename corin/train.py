from __future__ import annotations

import argparse
import json
from typing import Dict, Tuple

import numpy as np
import torch

from compressor import (
    CompressorModel,
    Standardizer,
    fit_pca_projection,
    make_random_projection,
)
from data import (
    load_embeddings,
    make_synthetic_embeddings,
    save_json,
    set_seed,
    train_test_split,
)
from metrics import topk_cosine_indices


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train embedding compressor")
    parser.add_argument(
        "--input", type=str, default="", help="Path to .npy/.npz embeddings"
    )
    parser.add_argument("--dim-out", type=int, default=64)
    parser.add_argument("--k", type=int, default=50)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--margin", type=float, default=0.1)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=str, default="compressor_model.npz")
    parser.add_argument("--max-items", type=int, default=5000)
    parser.add_argument("--init", type=str, choices=["random", "pca"], default="pca")
    parser.add_argument("--clip-percentile", type=float, default=0.0)
    parser.add_argument("--log-path", type=str, default="train_log.json")
    parser.add_argument("--synthetic-items", type=int, default=2000)
    parser.add_argument("--synthetic-dim", type=int, default=4096)
    parser.add_argument("--synthetic-clusters", type=int, default=32)
    parser.add_argument("--synthetic-std", type=float, default=0.3)
    return parser.parse_args()


def sample_triplets(
    rng: np.random.Generator,
    teacher_topk: np.ndarray,
    batch_size: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    num_items, k = teacher_topk.shape
    anchors = rng.integers(0, num_items, size=batch_size)
    positives = teacher_topk[anchors, rng.integers(0, k, size=batch_size)]
    negatives = np.empty(batch_size, dtype=np.int64)
    for i, anchor in enumerate(anchors):
        forbidden = set(teacher_topk[anchor])
        forbidden.add(anchor)
        candidate = rng.integers(0, num_items)
        while candidate in forbidden:
            candidate = rng.integers(0, num_items)
        negatives[i] = candidate
    return anchors, positives, negatives


def build_teacher_topk(embeddings: np.ndarray, k: int, max_items: int) -> np.ndarray:
    subset = embeddings[:max_items]
    return topk_cosine_indices(subset, k)


def train_model(
    embeddings: np.ndarray,
    dim_out: int,
    k: int,
    epochs: int,
    batch_size: int,
    lr: float,
    margin: float,
    weight_decay: float,
    seed: int,
    init: str,
    clip_percentile: float,
    max_items: int,
    log_path: str,
) -> CompressorModel:
    set_seed(seed)
    rng = np.random.default_rng(seed)
    split = train_test_split(embeddings, test_ratio=0.1, seed=seed)
    train_embeddings = split.train
    standardizer = Standardizer(
        clip_percentile=clip_percentile if clip_percentile > 0.0 else None
    )
    standardized = standardizer.fit_transform(train_embeddings)

    if init == "pca":
        weight = fit_pca_projection(standardized, dim_out)
    else:
        weight = make_random_projection(standardized.shape[1], dim_out, seed)

    device = torch.device("cpu")
    weight_param = torch.tensor(
        weight, dtype=torch.float32, device=device, requires_grad=True
    )
    optimizer = torch.optim.Adam([weight_param], lr=lr, weight_decay=weight_decay)

    teacher_topk = build_teacher_topk(standardized, k=k, max_items=max_items)
    indices = np.arange(min(max_items, standardized.shape[0]))
    data_tensor = torch.tensor(
        standardized[indices], dtype=torch.float32, device=device
    )

    log_records = []
    for epoch in range(1, epochs + 1):
        anchors, positives, negatives = sample_triplets(rng, teacher_topk, batch_size)
        anchor_vecs = data_tensor[anchors]
        pos_vecs = data_tensor[positives]
        neg_vecs = data_tensor[negatives]

        anchor_proj = torch.nn.functional.normalize(anchor_vecs @ weight_param, dim=1)
        pos_proj = torch.nn.functional.normalize(pos_vecs @ weight_param, dim=1)
        neg_proj = torch.nn.functional.normalize(neg_vecs @ weight_param, dim=1)

        sim_pos = (anchor_proj * pos_proj).sum(dim=1)
        sim_neg = (anchor_proj * neg_proj).sum(dim=1)
        loss = torch.relu(margin + sim_neg - sim_pos).mean()

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        log_records.append({"epoch": epoch, "loss": float(loss.item())})

    save_json(log_path, {"seed": seed, "records": log_records})
    meta = {
        "dim_out": dim_out,
        "k": k,
        "epochs": epochs,
        "batch_size": batch_size,
        "lr": lr,
        "margin": margin,
        "weight_decay": weight_decay,
        "seed": seed,
        "init": init,
        "clip_percentile": clip_percentile,
    }
    return CompressorModel(
        weight=weight_param.detach().cpu().numpy(),
        standardizer=standardizer,
        meta=meta,
    )


def main() -> None:
    args = parse_args()
    if args.input:
        embeddings = load_embeddings(args.input)
    else:
        embeddings = make_synthetic_embeddings(
            num_items=args.synthetic_items,
            dim=args.synthetic_dim,
            num_clusters=args.synthetic_clusters,
            cluster_std=args.synthetic_std,
            seed=args.seed,
        )

    model = train_model(
        embeddings=embeddings,
        dim_out=args.dim_out,
        k=args.k,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        margin=args.margin,
        weight_decay=args.weight_decay,
        seed=args.seed,
        init=args.init,
        clip_percentile=args.clip_percentile,
        max_items=args.max_items,
        log_path=args.log_path,
    )
    model.save(args.output)
    print(json.dumps({"output": args.output, "meta": model.meta}, indent=2))


if __name__ == "__main__":
    main()
