from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

import numpy as np


def l2_normalize(embeddings: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    return embeddings / np.maximum(norms, eps)


@dataclass
class Standardizer:
    mean: Optional[np.ndarray] = None
    std: Optional[np.ndarray] = None
    clip_percentile: Optional[float] = None

    def fit(self, embeddings: np.ndarray) -> None:
        if self.clip_percentile is not None:
            lower = np.percentile(embeddings, self.clip_percentile, axis=0)
            upper = np.percentile(embeddings, 100.0 - self.clip_percentile, axis=0)
            embeddings = np.clip(embeddings, lower, upper)
        mean = embeddings.mean(axis=0)
        std = embeddings.std(axis=0)
        std = np.where(std < 1e-6, 1.0, std)
        self.mean = mean
        self.std = std

    def transform(self, embeddings: np.ndarray) -> np.ndarray:
        if self.mean is None or self.std is None:
            raise ValueError("Standardizer is not fitted")
        return (embeddings - self.mean) / self.std

    def fit_transform(self, embeddings: np.ndarray) -> np.ndarray:
        self.fit(embeddings)
        return self.transform(embeddings)


@dataclass
class CompressorModel:
    weight: np.ndarray
    standardizer: Standardizer
    meta: dict

    def transform(self, embeddings: np.ndarray) -> np.ndarray:
        normalized = self.standardizer.transform(embeddings)
        projected = normalized @ self.weight
        return l2_normalize(projected)

    def save(self, path: str) -> None:
        if self.standardizer.mean is None or self.standardizer.std is None:
            raise ValueError("Standardizer must be fitted before saving")
        payload = json.dumps(self.meta, sort_keys=True)
        np.savez(
            path,
            weight=self.weight.astype(np.float32),
            mean=self.standardizer.mean.astype(np.float32),
            std=self.standardizer.std.astype(np.float32),
            meta=payload,
        )

    @staticmethod
    def load(path: str) -> "CompressorModel":
        data = np.load(path, allow_pickle=True)
        meta = json.loads(str(data["meta"]))
        standardizer = Standardizer(
            mean=np.asarray(data["mean"], dtype=np.float32),
            std=np.asarray(data["std"], dtype=np.float32),
        )
        return CompressorModel(
            weight=np.asarray(data["weight"], dtype=np.float32),
            standardizer=standardizer,
            meta=meta,
        )


def make_random_projection(
    dim_in: int,
    dim_out: int,
    seed: int,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    matrix = rng.standard_normal((dim_in, dim_out)).astype(np.float32)
    q, _ = np.linalg.qr(matrix)
    return q[:, :dim_out].astype(np.float32)


def fit_pca_projection(embeddings: np.ndarray, dim_out: int) -> np.ndarray:
    centered = embeddings - embeddings.mean(axis=0)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    return vt[:dim_out].T.astype(np.float32)
