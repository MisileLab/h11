"""S3/MinIO storage utilities."""

from typing import BinaryIO, Optional
from datetime import timedelta

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import get_settings


def get_s3_client():
    """
    Get S3 client configured for MinIO (dev) or AWS S3 (production).

    Returns:
        boto3.client: Configured S3 client
    """
    settings = get_settings()

    client_config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},  # Required for MinIO
    )

    if settings.use_minio:
        # Development: MinIO
        return boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
            config=client_config,
        )
    else:
        # Production: AWS S3
        return boto3.client(
            "s3",
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
            config=client_config,
        )


def generate_presigned_upload_url(
    bucket: str,
    key: str,
    expiry: Optional[int] = None,
    content_type: Optional[str] = None,
) -> str:
    """
    Generate presigned URL for uploading a file to S3.

    Args:
        bucket: S3 bucket name
        key: Object key (path in bucket)
        expiry: URL expiration time in seconds (default: from settings)
        content_type: Optional content type for the object

    Returns:
        str: Presigned URL for PUT operation

    Raises:
        ClientError: If URL generation fails
    """
    settings = get_settings()
    client = get_s3_client()

    params = {
        "Bucket": bucket,
        "Key": key,
    }

    if content_type:
        params["ContentType"] = content_type

    url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=expiry or settings.s3_presigned_url_expiry,
    )

    return url


def generate_presigned_download_url(
    bucket: str,
    key: str,
    expiry: Optional[int] = None,
    filename: Optional[str] = None,
) -> str:
    """
    Generate presigned URL for downloading a file from S3.

    Args:
        bucket: S3 bucket name
        key: Object key (path in bucket)
        expiry: URL expiration time in seconds (default: from settings)
        filename: Optional filename for Content-Disposition header

    Returns:
        str: Presigned URL for GET operation

    Raises:
        ClientError: If URL generation fails
    """
    settings = get_settings()
    client = get_s3_client()

    params = {
        "Bucket": bucket,
        "Key": key,
    }

    if filename:
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

    url = client.generate_presigned_url(
        ClientMethod="get_object",
        Params=params,
        ExpiresIn=expiry or settings.s3_presigned_url_expiry,
    )

    return url


def upload_file(
    file_obj: BinaryIO,
    bucket: str,
    key: str,
    content_type: Optional[str] = None,
    metadata: Optional[dict[str, str]] = None,
) -> str:
    """
    Upload a file to S3/MinIO.

    Args:
        file_obj: File-like object to upload
        bucket: S3 bucket name
        key: Object key (path in bucket)
        content_type: Optional content type
        metadata: Optional metadata dict

    Returns:
        str: Object key of uploaded file

    Raises:
        ClientError: If upload fails
    """
    client = get_s3_client()

    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type
    if metadata:
        extra_args["Metadata"] = metadata

    client.upload_fileobj(
        file_obj,
        bucket,
        key,
        ExtraArgs=extra_args if extra_args else None,
    )

    return key


def delete_file(bucket: str, key: str) -> bool:
    """
    Delete a file from S3/MinIO.

    Args:
        bucket: S3 bucket name
        key: Object key (path in bucket)

    Returns:
        bool: True if deletion successful

    Raises:
        ClientError: If deletion fails
    """
    client = get_s3_client()

    client.delete_object(Bucket=bucket, Key=key)
    return True


def file_exists(bucket: str, key: str) -> bool:
    """
    Check if a file exists in S3/MinIO.

    Args:
        bucket: S3 bucket name
        key: Object key (path in bucket)

    Returns:
        bool: True if file exists, False otherwise
    """
    client = get_s3_client()

    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return False
        raise


def list_files(bucket: str, prefix: str = "", max_keys: int = 1000) -> list[str]:
    """
    List files in S3/MinIO bucket with optional prefix.

    Args:
        bucket: S3 bucket name
        prefix: Optional key prefix to filter by
        max_keys: Maximum number of keys to return (default: 1000)

    Returns:
        list[str]: List of object keys

    Raises:
        ClientError: If listing fails
    """
    client = get_s3_client()

    response = client.list_objects_v2(
        Bucket=bucket,
        Prefix=prefix,
        MaxKeys=max_keys,
    )

    if "Contents" not in response:
        return []

    return [obj["Key"] for obj in response["Contents"]]


def get_file_size(bucket: str, key: str) -> int:
    """
    Get file size in bytes.

    Args:
        bucket: S3 bucket name
        key: Object key (path in bucket)

    Returns:
        int: File size in bytes

    Raises:
        ClientError: If file doesn't exist or operation fails
    """
    client = get_s3_client()

    response = client.head_object(Bucket=bucket, Key=key)
    return response["ContentLength"]


def copy_file(
    source_bucket: str,
    source_key: str,
    dest_bucket: str,
    dest_key: str,
) -> str:
    """
    Copy a file within S3/MinIO.

    Args:
        source_bucket: Source bucket name
        source_key: Source object key
        dest_bucket: Destination bucket name
        dest_key: Destination object key

    Returns:
        str: Destination object key

    Raises:
        ClientError: If copy fails
    """
    client = get_s3_client()

    copy_source = {
        "Bucket": source_bucket,
        "Key": source_key,
    }

    client.copy_object(
        CopySource=copy_source,
        Bucket=dest_bucket,
        Key=dest_key,
    )

    return dest_key


def download_from_s3(s3_key: str, local_path: str) -> None:
    """
    Download file from S3 to local filesystem.

    Args:
        s3_key: S3 object key
        local_path: Local file path to save to

    Raises:
        ClientError: If download fails
    """
    settings = get_settings()
    client = get_s3_client()

    client.download_file(settings.s3_bucket_name, s3_key, local_path)


def upload_to_s3(local_path: str, s3_key: str, content_type: Optional[str] = None) -> str:
    """
    Upload file from local filesystem to S3.

    Args:
        local_path: Local file path to upload
        s3_key: S3 object key (destination)
        content_type: Optional content type

    Returns:
        str: S3 object key

    Raises:
        ClientError: If upload fails
    """
    settings = get_settings()
    client = get_s3_client()

    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    client.upload_file(
        local_path,
        settings.s3_bucket_name,
        s3_key,
        ExtraArgs=extra_args if extra_args else None,
    )

    return s3_key
