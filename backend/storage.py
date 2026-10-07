"""File storage: S3-compatible (Cloudflare R2, AWS S3, ...) in production, local folder for development.

Production: set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT_URL for R2).
Development / tests: leave S3_BUCKET empty; files go to STORAGE_DIR (default ./data/uploads).
Note: Render's disk is ephemeral, so the local backend must not be used in production.
"""
import os
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class StorageError(Exception):
    pass


class LocalStorage:
    name = "local"

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise StorageError("invalid storage key")
        return p

    def put(self, key: str, data: bytes, content_type: str) -> dict:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return {"path": key, "size": len(data)}

    def get(self, key: str):
        p = self._path(key)
        if not p.is_file():
            raise StorageError("not found")
        return p.read_bytes()


class S3Storage:
    name = "s3"

    def __init__(self):
        import boto3
        from botocore.config import Config
        self.bucket = os.environ["S3_BUCKET"]
        self.client = boto3.client(
            "s3",
            endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
            aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("S3_REGION", "auto"),
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    def put(self, key: str, data: bytes, content_type: str) -> dict:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return {"path": key, "size": len(data)}

    def get(self, key: str):
        try:
            obj = self.client.get_object(Bucket=self.bucket, Key=key)
        except Exception as e:  # botocore ClientError and friends
            raise StorageError(str(e)) from e
        return obj["Body"].read()


_storage = None


def get_storage():
    global _storage
    if _storage is None:
        if os.environ.get("S3_BUCKET"):
            _storage = S3Storage()
        else:
            _storage = LocalStorage(os.environ.get("STORAGE_DIR", str(Path(__file__).parent / "data" / "uploads")))
            logger.warning("S3_BUCKET not set: using local file storage (development only)")
    return _storage


def reset_storage():
    """For tests."""
    global _storage
    _storage = None


async def put_object(key: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(get_storage().put, key, data, content_type)


async def get_object(key: str) -> bytes:
    return await asyncio.to_thread(get_storage().get, key)
