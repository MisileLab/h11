from __future__ import annotations

import argparse
import json
import time

import numpy as np

from compressor import CompressorModel
from data import load_embeddings, save_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark embedding compressor")
    parser.add_argument("--input", type=str, required=True)
    parser.add_argument("--model", type=str, required=True)
    parser.add_argument("--batch", type=int, default=1024)
    parser.add_argument("--repeats", type=int, default=50)
    parser.add_argument("--output", type=str, default="benchmark.json")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    embeddings = load_embeddings(args.input)
    model = CompressorModel.load(args.model)
    batch = embeddings[: args.batch]

    start = time.perf_counter()
    for _ in range(args.repeats):
        _ = model.transform(batch)
    elapsed = time.perf_counter() - start

    compressed = model.transform(embeddings)
    payload = {
        "batch": args.batch,
        "repeats": args.repeats,
        "total_time_sec": elapsed,
        "avg_time_per_batch_sec": elapsed / args.repeats,
        "avg_time_per_vector_ms": (elapsed / (args.repeats * args.batch)) * 1000.0,
        "bytes_original": int(embeddings.nbytes),
        "bytes_compressed": int(compressed.nbytes),
        "compression_ratio": float(embeddings.nbytes / max(compressed.nbytes, 1)),
    }
    save_json(args.output, payload)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
