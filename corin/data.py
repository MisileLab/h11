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
    val: np.ndarray
    test: np.ndarray
    train_idx: np.ndarray
    val_idx: np.ndarray
    test_idx: np.ndarray


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
    api = HfApi()
    info = api.dataset_info(repo_id=repo_id, revision=revision)
    if info.sha is None:
        raise ValueError("Dataset revision SHA not found")
    commit_sha = info.sha
    files = api.list_repo_files(repo_id=repo_id, repo_type="dataset", revision=revision)
    parquet_files = [name for name in files if name.endswith(".parquet")]
    if parquet_file:
        if parquet_file in files:
            return parquet_file, commit_sha
        if len(parquet_files) == 1:
            return parquet_files[0], commit_sha
        if parquet_files:
            raise ValueError(
                f"Parquet file '{parquet_file}' not found; available: {', '.join(parquet_files)}"
            )
        raise ValueError("No parquet files found in dataset repository")
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
    if column not in df.columns:
        candidates = [name for name in df.columns if column.lower() in name.lower()]
        if len(candidates) == 1:
            column = candidates[0]
        elif candidates:
            raise ValueError(
                f"Embedding column '{column}' not found; candidates: {', '.join(candidates)}"
            )
        else:
            raise ValueError(
                f"Embedding column '{column}' not found; available: {', '.join(df.columns)}"
            )
    series = df[column]
    values = [
        json.loads(value) if isinstance(value, str) else value
        for value in series.to_list()
    ]
    embeddings = np.asarray(values, dtype=np.float32)
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
    val_ratio: float = 0.1,
) -> DatasetSplit:
    if not 0.0 < test_ratio < 1.0:
        raise ValueError("test_ratio must be in (0, 1)")
    if not 0.0 <= val_ratio < 1.0:
        raise ValueError("val_ratio must be in [0, 1)")
    if test_ratio + val_ratio >= 1.0:
        raise ValueError("test_ratio + val_ratio must be < 1")
    rng = np.random.default_rng(seed)
    indices = np.arange(embeddings.shape[0])
    rng.shuffle(indices)
    test_size = int(embeddings.shape[0] * test_ratio)
    val_size = int(embeddings.shape[0] * val_ratio)
    test_start = embeddings.shape[0] - test_size
    val_start = test_start - val_size
    train_idx = indices[:val_start]
    val_idx = indices[val_start:test_start] if val_size else indices[:0]
    test_idx = indices[test_start:] if test_size else indices[:0]
    return DatasetSplit(
        train=embeddings[train_idx],
        val=embeddings[val_idx],
        test=embeddings[test_idx],
        train_idx=train_idx,
        val_idx=val_idx,
        test_idx=test_idx,
    )


def save_json(path: str, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
