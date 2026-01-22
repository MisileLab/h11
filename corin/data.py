from __future__ import annotations

import json
import random
from dataclasses import dataclass
from typing import Tuple

import numpy as np


@dataclass
class DatasetSplit:
    train: np.ndarray
    test: np.ndarray


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)


def load_embeddings(path: str) -> np.ndarray:
    if path.endswith(".npy"):
        data = np.load(path)
        return np.asarray(data, dtype=np.float32)
    if path.endswith(".npz"):
        data = np.load(path)
        if "embeddings" in data:
            return np.asarray(data["embeddings"], dtype=np.float32)
        if len(data.files) == 1:
            return np.asarray(data[data.files[0]], dtype=np.float32)
        raise ValueError("npz must contain key 'embeddings' or a single array")
    raise ValueError("Unsupported file extension; use .npy or .npz")


def make_synthetic_embeddings(
    num_items: int,
    dim: int,
    num_clusters: int,
    cluster_std: float,
    seed: int,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    centers = rng.standard_normal((num_clusters, dim)).astype(np.float32)
    assignments = rng.integers(0, num_clusters, size=num_items)
    noise = rng.standard_normal((num_items, dim)).astype(np.float32) * cluster_std
    return centers[assignments] + noise


def train_test_split(
    embeddings: np.ndarray,
    test_ratio: float,
    seed: int,
) -> DatasetSplit:
    if not 0.0 < test_ratio < 1.0:
        raise ValueError("test_ratio must be in (0, 1)")
    rng = np.random.default_rng(seed)
    indices = np.arange(embeddings.shape[0])
    rng.shuffle(indices)
    split = int(embeddings.shape[0] * (1.0 - test_ratio))
    train_idx = indices[:split]
    test_idx = indices[split:]
    return DatasetSplit(train=embeddings[train_idx], test=embeddings[test_idx])


def save_json(path: str, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
