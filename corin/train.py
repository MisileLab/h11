from __future__ import annotations

import argparse
import json
from typing import Dict, Mapping, Tuple

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
    load_hf_parquet,
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
    parser.add_argument("--tau", type=float, default=0.05)
    parser.add_argument("--lambda-list", type=float, default=1.0)
    parser.add_argument("--hard-neg-l", type=int, default=200)
    parser.add_argument("--hard-neg-per-anchor", type=int, default=1)
    parser.add_argument("--listwise-queue-size", type=int, default=0)
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
    parser.add_argument(
        "--hf-dataset",
        type=str,
        default="chaehoyu/wikipedia-22-12-ko-embeddings-100k",
        help="HF dataset repo id (parquet)",
    )
    parser.add_argument("--hf-revision", type=str, default="main")
    parser.add_argument("--hf-embedding-column", type=str, default="")
    parser.add_argument("--hf-parquet-file", type=str, default="")
    return parser.parse_args()


def sample_triplets(
    rng: np.random.Generator,
    teacher_topk: np.ndarray,
    k: int,
    batch_size: int,
    hard_neg_per_anchor: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    num_items, teacher_k = teacher_topk.shape
    anchors = rng.integers(0, num_items, size=batch_size)
    positives = teacher_topk[anchors, rng.integers(0, k, size=batch_size)]
    negatives = np.empty((batch_size, hard_neg_per_anchor), dtype=np.int64)
    for i, anchor in enumerate(anchors):
        hard_pool = teacher_topk[anchor, k:teacher_k]
        if hard_pool.size:
            replace = hard_pool.size < hard_neg_per_anchor
            negatives[i] = rng.choice(
                hard_pool, size=hard_neg_per_anchor, replace=replace
            )
            continue
        forbidden = set(teacher_topk[anchor, :k])
        forbidden.add(anchor)
        for j in range(hard_neg_per_anchor):
            candidate = rng.integers(0, num_items)
            while candidate in forbidden:
                candidate = rng.integers(0, num_items)
            negatives[i, j] = candidate
    return anchors, positives, negatives


def build_teacher_topk(embeddings: np.ndarray, k: int, hard_neg_l: int) -> np.ndarray:
    num_items = embeddings.shape[0]
    if num_items < 2:
        raise ValueError("Need at least 2 items to compute top-k")
    effective_l = max(hard_neg_l, k + 1)
    effective_l = min(effective_l, num_items - 1)
    if effective_l < k:
        raise ValueError("hard_neg_l must be >= k + 1")
    return topk_cosine_indices(embeddings, effective_l)


def train_model(
    embeddings: np.ndarray,
    dim_out: int,
    k: int,
    epochs: int,
    batch_size: int,
    lr: float,
    margin: float,
    tau: float,
    lambda_list: float,
    hard_neg_l: int,
    hard_neg_per_anchor: int,
    listwise_queue_size: int,
    weight_decay: float,
    seed: int,
    init: str,
    clip_percentile: float,
    max_items: int,
    log_path: str,
    data_meta: Mapping[str, object],
) -> CompressorModel:
    set_seed(seed)
    rng = np.random.default_rng(seed)
    rows = min(max_items, embeddings.shape[0])
    subset = embeddings[:rows]
    split = train_test_split(subset, test_ratio=0.1, val_ratio=0.1, seed=seed)
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

    if tau <= 0.0:
        raise ValueError("tau must be positive")
    if hard_neg_per_anchor < 1:
        raise ValueError("hard_neg_per_anchor must be >= 1")
    teacher_topk = build_teacher_topk(train_embeddings, k=k, hard_neg_l=hard_neg_l)
    hard_neg_l_effective = int(teacher_topk.shape[1])
    data_tensor = torch.tensor(standardized, dtype=torch.float32, device=device)
    teacher_tensor = torch.tensor(train_embeddings, dtype=torch.float32, device=device)
    queue_indices: list[int] = []

    log_records = []
    for epoch in range(1, epochs + 1):
        anchors, positives, negatives = sample_triplets(
            rng,
            teacher_topk,
            k,
            batch_size,
            hard_neg_per_anchor,
        )
        anchor_vecs = data_tensor[anchors]
        pos_vecs = data_tensor[positives]
        neg_vecs = data_tensor[negatives]

        anchor_proj = torch.nn.functional.normalize(anchor_vecs @ weight_param, dim=1)
        pos_proj = torch.nn.functional.normalize(pos_vecs @ weight_param, dim=1)
        neg_proj = torch.nn.functional.normalize(neg_vecs @ weight_param, dim=2)

        sim_pos = (anchor_proj * pos_proj).sum(dim=1)
        sim_neg = (anchor_proj[:, None, :] * neg_proj).sum(dim=2)
        sim_neg_best = sim_neg.max(dim=1).values
        triplet_loss = torch.relu(margin + sim_neg_best - sim_pos).mean()

        listwise_loss = torch.tensor(0.0, device=device)
        if lambda_list > 0.0:
            candidates = np.concatenate(
                [anchors, positives, negatives.reshape(-1)]
            ).astype(np.int64)
            if listwise_queue_size > 0 and queue_indices:
                candidates = np.concatenate(
                    [candidates, np.asarray(queue_indices, dtype=np.int64)]
                )
            candidates = np.unique(candidates)
            if candidates.size > 1:
                candidate_tensor = data_tensor[candidates]
                teacher_candidates_raw = teacher_tensor[candidates]
                teacher_anchor = torch.nn.functional.normalize(
                    teacher_tensor[anchors], dim=1
                )
                teacher_candidates = torch.nn.functional.normalize(
                    teacher_candidates_raw, dim=1
                )
                sim_t = teacher_anchor @ teacher_candidates.T
                student_candidates = torch.nn.functional.normalize(
                    candidate_tensor @ weight_param, dim=1
                )
                sim_s = anchor_proj @ student_candidates.T
                candidate_ids = torch.tensor(
                    candidates, dtype=torch.int64, device=device
                )
                anchor_ids = torch.tensor(anchors, dtype=torch.int64, device=device)
                self_mask = candidate_ids.unsqueeze(0) == anchor_ids.unsqueeze(1)
                sim_t = sim_t.masked_fill(self_mask, -1e9)
                sim_s = sim_s.masked_fill(self_mask, -1e9)
                log_p_t = torch.nn.functional.log_softmax(sim_t / tau, dim=1)
                log_p_s = torch.nn.functional.log_softmax(sim_s / tau, dim=1)
                p_t = torch.exp(log_p_t)
                listwise_loss = (p_t * (log_p_t - log_p_s)).sum(dim=1).mean()

        loss = triplet_loss + lambda_list * listwise_loss

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        log_records.append(
            {
                "epoch": epoch,
                "loss": float(loss.item()),
                "triplet_loss": float(triplet_loss.item()),
                "listwise_loss": float(listwise_loss.item()),
            }
        )

        if listwise_queue_size > 0:
            queue_indices.extend(anchors.tolist())
            if len(queue_indices) > listwise_queue_size:
                queue_indices = queue_indices[-listwise_queue_size:]

    save_json(log_path, {"seed": seed, "records": log_records, "data": data_meta})
    split_meta = {
        "seed": seed,
        "val_ratio": 0.1,
        "test_ratio": 0.1,
        "train_size": int(split.train_idx.size),
        "val_size": int(split.val_idx.size),
        "test_size": int(split.test_idx.size),
        "train_idx": split.train_idx.tolist(),
        "val_idx": split.val_idx.tolist(),
        "test_idx": split.test_idx.tolist(),
    }
    meta = {
        "dim_in": int(embeddings.shape[1]),
        "dim_out": dim_out,
        "k": k,
        "rows": int(rows),
        "epochs": epochs,
        "batch_size": batch_size,
        "lr": lr,
        "margin": margin,
        "tau": tau,
        "lambda_list": lambda_list,
        "hard_neg_l": hard_neg_l,
        "hard_neg_l_effective": hard_neg_l_effective,
        "hard_neg_per_anchor": hard_neg_per_anchor,
        "listwise_queue_size": listwise_queue_size,
        "weight_decay": weight_decay,
        "seed": seed,
        "init": init,
        "clip_percentile": clip_percentile,
        "split": split_meta,
        "data": data_meta,
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
        data_meta = {"source": "file", "path": args.input}
    elif args.hf_dataset:
        embeddings, info = load_hf_parquet(
            repo_id=args.hf_dataset,
            revision=args.hf_revision,
            embedding_column=args.hf_embedding_column or None,
            parquet_file=args.hf_parquet_file or None,
            max_items=args.max_items,
        )
        data_meta = {"source": "hf", **info}
    else:
        embeddings = make_synthetic_embeddings(
            num_items=args.synthetic_items,
            dim=args.synthetic_dim,
            num_clusters=args.synthetic_clusters,
            cluster_std=args.synthetic_std,
            seed=args.seed,
        )
        data_meta = {"source": "synthetic", "items": str(args.synthetic_items)}

    model = train_model(
        embeddings=embeddings,
        dim_out=args.dim_out,
        k=args.k,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        margin=args.margin,
        tau=args.tau,
        lambda_list=args.lambda_list,
        hard_neg_l=args.hard_neg_l,
        hard_neg_per_anchor=args.hard_neg_per_anchor,
        listwise_queue_size=args.listwise_queue_size,
        weight_decay=args.weight_decay,
        seed=args.seed,
        init=args.init,
        clip_percentile=args.clip_percentile,
        max_items=args.max_items,
        log_path=args.log_path,
        data_meta=data_meta,
    )
    model.save(args.output)
    print(json.dumps({"output": args.output, "meta": model.meta}, indent=2))


if __name__ == "__main__":
    main()
