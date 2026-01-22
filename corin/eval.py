from __future__ import annotations

import argparse
import json
from typing import Dict

import numpy as np

from compressor import CompressorModel
from data import load_embeddings, save_json
from metrics import compute_metrics, topk_cosine_indices


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate embedding compressor")
    parser.add_argument("--input", type=str, required=True)
    parser.add_argument("--model", type=str, required=True)
    parser.add_argument("--k", type=int, default=50)
    parser.add_argument("--max-items", type=int, default=5000)
    parser.add_argument("--output", type=str, default="eval_results.json")
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
    embeddings = load_embeddings(args.input)
    model = CompressorModel.load(args.model)
    metrics = evaluate(embeddings, model, args.k, args.max_items)
    payload = {"metrics": metrics, "k": args.k, "max_items": args.max_items}
    save_json(args.output, payload)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
