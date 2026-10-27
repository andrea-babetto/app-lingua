"""Put a backup back, in case of trouble. It always restores into a NEW, empty database, never on top of the live one.

Usage (from the repository folder, with the backend's requirements installed):
    MONGO_URL="<the Atlas connection string>" python tools/restore_backup.py glotter-backup-2026-10-28.jsonl.gz lingua_restored

The file comes from /admin › Backup › Download. Then, to use the restored data, change DB_NAME on lingua-api
(Render › Environment) to the new database name and redeploy.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

import backup  # noqa: E402


async def main(path, db_name):
    url = os.environ.get("MONGO_URL")
    if not url:
        sys.exit("Set MONGO_URL first (never write it in a file).")
    data = Path(path).read_bytes()
    counts = await backup.restore(AsyncIOMotorClient(url)[db_name], data)
    for name, n in sorted(counts.items()):
        print(f"{name}: {n}")
    print(f"Restored into database '{db_name}'.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
