from __future__ import annotations

import json

import numpy as np

from data import make_synthetic_embeddings, set_seed
from metrics import compute_metrics, topk_cosine_indices
from train import train_model


def main() -> None:
    seed = 7
    set_seed(seed)
    embeddings = make_synthetic_embeddings(
        num_items=256,
        dim=128,
        num_clusters=16,
        cluster_std=0.4,
        seed=seed,
    )
    model = train_model(
        embeddings=embeddings,
        dim_out=16,
        k=10,
        epochs=5,
        batch_size=64,
        lr=5e-3,
        margin=0.1,
        tau=0.05,
        lambda_list=1.0,
        hard_neg_l=50,
        hard_neg_per_anchor=1,
        listwise_queue_size=0,
        weight_decay=1e-4,
        seed=seed,
        init="pca",
        clip_percentile=0.0,
        max_items=256,
        log_path="e2e_train_log.json",
        data_meta={"source": "synthetic", "items": "256"},
    )

    teacher_topk = topk_cosine_indices(embeddings, k=10)
    student_topk = topk_cosine_indices(model.transform(embeddings), k=10)
    metrics = compute_metrics(teacher_topk, student_topk)
    print(json.dumps({"metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
