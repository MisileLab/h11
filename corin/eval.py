from __future__ import annotations

import argparse
import json
from typing import Dict

import numpy as np

from compressor import CompressorModel
from data import load_embeddings, load_hf_parquet, save_json
from metrics import compute_metrics, topk_cosine_indices


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate embedding compressor")
    parser.add_argument("--input", type=str, default="")
    parser.add_argument("--model", type=str, required=True)
    parser.add_argument("--k", type=int, default=50)
    parser.add_argument("--max-items", type=int, default=5000)
    parser.add_argument("--output", type=str, default="eval_results.json")
    parser.add_argument(
        "--hf-dataset",
        type=str,
        default="chaehoyu/wikipedia-22-12-ko-embeddings-100k",
    )
    parser.add_argument("--hf-revision", type=str, default="main")
    parser.add_argument("--hf-embedding-column", type=str, default="")
    parser.add_argument("--hf-parquet-file", type=str, default="")
    return parser.parse_args()


def evaluate(
    embeddings: np.ndarray,
    model: CompressorModel,
    k: int,
    max_items: int,
) -> Dict[str, float]:
    subset = embeddings[:max_items]
    teacher_topk = topk_cosine_indices(subset, k)
    compressed = model.transform(subset)
    student_topk = topk_cosine_indices(compressed, k)
    return compute_metrics(teacher_topk, student_topk)


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
        raise ValueError("Provide --input or --hf-dataset")
    model = CompressorModel.load(args.model)
    metrics = evaluate(embeddings, model, args.k, args.max_items)
    payload = {
        "metrics": metrics,
        "k": args.k,
        "max_items": args.max_items,
        "data": data_meta,
    }
    save_json(args.output, payload)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
