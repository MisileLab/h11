import numpy as np

from compressor import Standardizer, make_random_projection


def test_standardizer_shapes() -> None:
    embeddings = np.random.default_rng(0).standard_normal((32, 16)).astype(np.float32)
    standardizer = Standardizer()
    transformed = standardizer.fit_transform(embeddings)
    assert transformed.shape == embeddings.shape
    assert np.allclose(transformed.mean(axis=0), 0.0, atol=1e-5)


def test_random_projection_shape() -> None:
    projection = make_random_projection(dim_in=64, dim_out=16, seed=0)
    assert projection.shape == (64, 16)
