from __future__ import annotations

import json
import random
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
import polars as pl
from huggingface_hub import HfApi, hf_hub_download


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


def resolve_parquet_file(
    repo_id: str,
    revision: str,
    parquet_file: Optional[str],
) -> Tuple[str, str]:
    if parquet_file:
        api = HfApi()
        info = api.dataset_info(repo_id=repo_id, revision=revision)
        return parquet_file, info.sha
    api = HfApi()
    info = api.dataset_info(repo_id=repo_id, revision=revision)
    commit_sha = info.sha
    files = api.list_repo_files(repo_id=repo_id, repo_type="dataset", revision=revision)
    parquet_files = [name for name in files if name.endswith(".parquet")]
    if not parquet_files:
        raise ValueError("No parquet files found in dataset repository")
    return parquet_files[0], commit_sha


def load_hf_parquet(
    repo_id: str,
    revision: str,
    embedding_column: Optional[str],
    parquet_file: Optional[str],
    max_items: Optional[int],
) -> Tuple[np.ndarray, dict]:
    parquet_name, commit_sha = resolve_parquet_file(repo_id, revision, parquet_file)
    local_path = hf_hub_download(
        repo_id=repo_id,
        repo_type="dataset",
        filename=parquet_name,
        revision=revision,
    )
    frame = pl.scan_parquet(local_path)
    if max_items is not None:
        frame = frame.limit(max_items)
    df = frame.collect()
    column = embedding_column or infer_embedding_column(df.columns)
    series = df[column]
    embeddings = np.asarray(series.to_list(), dtype=np.float32)
    meta = {
        "repo_id": repo_id,
        "revision": revision,
        "commit_sha": commit_sha,
        "parquet_file": parquet_name,
        "embedding_column": column,
        "rows": df.shape[0],
    }
    return embeddings, meta


def infer_embedding_column(columns: list[str]) -> str:
    candidates = [name for name in columns if "embedding" in name.lower()]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise ValueError("Embedding column not found; specify --hf-embedding-column")
    raise ValueError(
        "Multiple embedding columns found; specify --hf-embedding-column: "
        + ", ".join(candidates)
    )


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
