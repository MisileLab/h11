"""Test script for MinIO/S3 connectivity."""

import io
import sys
from pathlib import Path

# Add parent directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.s3 import (
    get_s3_client,
    generate_presigned_upload_url,
    generate_presigned_download_url,
    upload_file,
    delete_file,
    file_exists,
    list_files,
    get_file_size,
)
from app.config import get_settings


def test_minio_connectivity():
    """Test MinIO connectivity and basic operations."""
    settings = get_settings()

    print("=" * 60)
    print("MinIO/S3 Connectivity Test")
    print("=" * 60)
    print(f"Using MinIO: {settings.use_minio}")
    print(f"Endpoint: {settings.s3_endpoint_url if settings.use_minio else 'AWS S3'}")
    print(f"Region: {settings.s3_region}")
    print()

    # Test 1: Get S3 client
    print("Test 1: Initialize S3 client...")
    try:
        client = get_s3_client()
        print("✓ S3 client initialized successfully")
    except Exception as e:
        print(f"✗ Failed to initialize S3 client: {e}")
        return False

    # Test 2: List buckets
    print("\nTest 2: List buckets...")
    try:
        response = client.list_buckets()
        buckets = [b["Name"] for b in response.get("Buckets", [])]
        print(f"✓ Found {len(buckets)} buckets:")
        for bucket in buckets:
            print(f"  - {bucket}")
    except Exception as e:
        print(f"✗ Failed to list buckets: {e}")
        return False

    # Test 3: Upload test file
    test_bucket = settings.s3_bucket_originals
    test_key = "test/connectivity_test.txt"
    test_content = b"Hello from Corin! This is a connectivity test."

    print(f"\nTest 3: Upload test file to {test_bucket}/{test_key}...")
    try:
        file_obj = io.BytesIO(test_content)
        upload_file(
            file_obj,
            test_bucket,
            test_key,
            content_type="text/plain",
            metadata={"test": "true", "source": "connectivity_test"},
        )
        print("✓ File uploaded successfully")
    except Exception as e:
        print(f"✗ Failed to upload file: {e}")
        return False

    # Test 4: Check file exists
    print(f"\nTest 4: Check if file exists...")
    try:
        exists = file_exists(test_bucket, test_key)
        if exists:
            print("✓ File exists")
        else:
            print("✗ File not found")
            return False
    except Exception as e:
        print(f"✗ Failed to check file existence: {e}")
        return False

    # Test 5: Get file size
    print(f"\nTest 5: Get file size...")
    try:
        size = get_file_size(test_bucket, test_key)
        print(f"✓ File size: {size} bytes")
    except Exception as e:
        print(f"✗ Failed to get file size: {e}")
        return False

    # Test 6: List files
    print(f"\nTest 6: List files in bucket with prefix 'test/'...")
    try:
        files = list_files(test_bucket, prefix="test/")
        print(f"✓ Found {len(files)} files:")
        for file_key in files:
            print(f"  - {file_key}")
    except Exception as e:
        print(f"✗ Failed to list files: {e}")
        return False

    # Test 7: Generate presigned upload URL
    print(f"\nTest 7: Generate presigned upload URL...")
    try:
        upload_url = generate_presigned_upload_url(
            test_bucket,
            "test/presigned_test.txt",
            expiry=300,
        )
        print(f"✓ Generated upload URL (expires in 300s)")
        print(f"  URL length: {len(upload_url)} chars")
    except Exception as e:
        print(f"✗ Failed to generate upload URL: {e}")
        return False

    # Test 8: Generate presigned download URL
    print(f"\nTest 8: Generate presigned download URL...")
    try:
        download_url = generate_presigned_download_url(
            test_bucket,
            test_key,
            expiry=300,
            filename="connectivity_test.txt",
        )
        print(f"✓ Generated download URL (expires in 300s)")
        print(f"  URL length: {len(download_url)} chars")
    except Exception as e:
        print(f"✗ Failed to generate download URL: {e}")
        return False

    # Test 9: Delete test file
    print(f"\nTest 9: Delete test file...")
    try:
        delete_file(test_bucket, test_key)
        print("✓ File deleted successfully")
    except Exception as e:
        print(f"✗ Failed to delete file: {e}")
        return False

    # Test 10: Verify deletion
    print(f"\nTest 10: Verify file deletion...")
    try:
        exists = file_exists(test_bucket, test_key)
        if not exists:
            print("✓ File no longer exists")
        else:
            print("✗ File still exists after deletion")
            return False
    except Exception as e:
        print(f"✗ Failed to verify deletion: {e}")
        return False

    print("\n" + "=" * 60)
    print("✓ All tests passed!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = test_minio_connectivity()
    sys.exit(0 if success else 1)
