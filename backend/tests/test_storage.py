"""Storage backends: S3/R2 (simulated with moto) and the local development folder."""
import boto3
import pytest
from moto import mock_aws

import storage


def test_local_storage_roundtrip_and_path_traversal(tmp_path):
    s = storage.LocalStorage(str(tmp_path / "root"))
    assert s.put("u/1.png", b"abc", "image/png") == {"path": "u/1.png", "size": 3}
    assert s.get("u/1.png") == b"abc"
    for bad in ("../outside.txt", "u/../../outside.txt", "/etc/passwd"):
        with pytest.raises(storage.StorageError):
            s.put(bad, b"x", "text/plain")
        with pytest.raises(storage.StorageError):
            s.get(bad)
    with pytest.raises(storage.StorageError):
        s.get("missing.png")


@mock_aws
def test_s3_roundtrip(monkeypatch):
    for k, v in {"S3_BUCKET": "lingua-test", "S3_ACCESS_KEY_ID": "k", "S3_SECRET_ACCESS_KEY": "s", "S3_REGION": "us-east-1"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("S3_ENDPOINT_URL", raising=False)
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="lingua-test")
    storage.reset_storage()
    s = storage.get_storage()
    assert s.name == "s3"
    assert s.put("lingua/uploads/u/1.png", b"data", "image/png")["size"] == 4
    assert s.get("lingua/uploads/u/1.png") == b"data"
    with pytest.raises(storage.StorageError):
        s.get("nope")
    storage.reset_storage()


def test_default_is_local_when_no_bucket(monkeypatch, tmp_path):
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "d"))
    storage.reset_storage()
    assert storage.get_storage().name == "local"
    storage.reset_storage()
