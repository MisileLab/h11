from __future__ import annotations

import argparse
import json

import numpy as np

from data import load_embeddings, load_hf_parquet, make_synthetic_embeddings, save_json
from eval import evaluate
from train import train_model


def parse_dim_outs(value: str) -> list[int]:
    dims = [int(part.strip()) for part in value.split(",") if part.strip()]
    if not dims:
        raise ValueError("dim-outs must be a comma-separated list")
    return dims


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sweep dim_out values")
    parser.add_argument("--dim-outs", type=str, default="64,32,16")
    parser.add_argument("--output", type=str, default="sweep_results.jsonl")
    parser.add_argument(
        "--output-format", type=str, choices=["jsonl", "json"], default="jsonl"
    )
    parser.add_argument(
        "--input", type=str, default="", help="Path to .npy/.npz embeddings"
    )
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
    parser.add_argument("--max-items", type=int, default=5000)
    parser.add_argument("--init", type=str, choices=["random", "pca"], default="pca")
    parser.add_argument("--clip-percentile", type=float, default=0.0)
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

    dim_outs = parse_dim_outs(args.dim_outs)
    results = []
    jsonl_handle = None
    if args.output_format == "jsonl":
        jsonl_handle = open(args.output, "w", encoding="utf-8")
    try:
        for dim_out in dim_outs:
            model = train_model(
                embeddings=embeddings,
                dim_out=dim_out,
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
                log_path=f"train_log_dim{dim_out}.json",
                data_meta=data_meta,
            )
            metrics = evaluate(embeddings, model, args.k, args.max_items)
            payload = {"metrics": metrics, "meta": model.meta}
            results.append(payload)
            if jsonl_handle is not None:
                jsonl_handle.write(json.dumps(payload) + "\n")
    finally:
        if jsonl_handle is not None:
            jsonl_handle.close()

    if args.output_format == "json":
        save_json(args.output, {"results": results})

    print(json.dumps({"results": results}, indent=2))


if __name__ == "__main__":
    main()
