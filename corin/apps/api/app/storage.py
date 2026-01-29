from __future__ import annotations

from dataclasses import dataclass

import boto3
from botocore.config import Config

from app.config import get_settings


@dataclass
class PresignedUrl:
    url: str
    expires_in: int


def get_s3_client():
    settings = get_settings()
    config = None
    if settings.s3_use_path_style:
        config = Config(s3={"addressing_style": "path"})
    endpoint_url = settings.s3_endpoint_url or None
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        config=config,
    )


def ensure_bucket() -> None:
    settings = get_settings()
    client = get_s3_client()
    existing = [b["Name"] for b in client.list_buckets().get("Buckets", [])]
    if settings.s3_bucket in existing:
        return
    client.create_bucket(Bucket=settings.s3_bucket)


def upload_fileobj(object_key: str, fileobj, content_type: str | None = None) -> None:
    settings = get_settings()
    client = get_s3_client()
    extra_args = {"ContentType": content_type} if content_type else None
    if extra_args:
        client.upload_fileobj(
            fileobj, settings.s3_bucket, object_key, ExtraArgs=extra_args
        )
    else:
        client.upload_fileobj(fileobj, settings.s3_bucket, object_key)


def download_file(object_key: str, target_path: str) -> None:
    settings = get_settings()
    client = get_s3_client()
    client.download_file(settings.s3_bucket, object_key, target_path)


def presigned_get(object_key: str, expires_in: int = 3600) -> PresignedUrl:
    settings = get_settings()
    client = get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key},
        ExpiresIn=expires_in,
    )
    return PresignedUrl(url=url, expires_in=expires_in)
