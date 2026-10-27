"""Nightly backup of the database (the free Atlas plan has none).

Every night the whole database goes, as one compressed file, to the same storage as the photos (Cloudflare R2 in
production), under lingua/backups/<date>.jsonl.gz. Copies older than KEEP_DAYS are deleted. Each line is
{"c": collection, "d": document} in MongoDB extended JSON, so a copy can be put back exactly (restore()).
The translation cache is left out: it is only a speed-up and fills itself again.
"""
import gzip
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from bson import json_util

import storage

logger = logging.getLogger(__name__)

KEEP_DAYS = int(os.environ.get("BACKUP_KEEP_DAYS", "14"))
HOUR_UTC = 2  # after 2:00 UTC (3-4 at night in Italy)
SKIP = {"translation_cache", "backups"}


def key_for(day: str) -> str:
    return f"lingua/backups/{day}.jsonl.gz"


async def make_backup(db, now=None):
    """Write today's copy and delete the ones that are too old. Returns the record kept in db.backups."""
    now = now or datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    counts, lines = {}, []
    for name in sorted(await db.list_collection_names()):
        if name in SKIP or name.startswith("system."):
            continue
        n = 0
        async for doc in db[name].find({}):
            lines.append(json.dumps({"c": name, "d": json.loads(json_util.dumps(doc, json_options=json_util.CANONICAL_JSON_OPTIONS))},
                                    ensure_ascii=False))
            n += 1
        counts[name] = n
    data = gzip.compress(("\n".join(lines) + "\n").encode())
    stored = await storage.put_object(key_for(day), data, "application/gzip")
    record = {"day": day, "key": stored["path"], "size": stored.get("size", len(data)), "counts": counts, "created_at": now.isoformat()}
    await db.backups.update_one({"day": day}, {"$set": record}, upsert=True)
    cutoff = (now - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    for old in await db.backups.find({"day": {"$lt": cutoff}}, {"_id": 0}).to_list(1000):
        try:
            await storage.delete_object(old["key"])
        except Exception:
            logger.warning("could not delete old backup %s", old["key"])
        await db.backups.delete_one({"day": old["day"]})
    logger.info("backup %s: %d bytes, %s", day, record["size"], counts)
    return record


async def due(db, now=None):
    """Is tonight's copy still to be made?"""
    now = now or datetime.now(timezone.utc)
    if now.hour < HOUR_UTC:
        return False
    return not await db.backups.find_one({"day": now.strftime("%Y-%m-%d")}, {"_id": 1})


def read(data: bytes):
    """The documents in a copy, as (collection, document) pairs."""
    for line in gzip.decompress(data).decode().splitlines():
        if line.strip():
            row = json.loads(line)
            yield row["c"], json_util.loads(json.dumps(row["d"]))


async def restore(target_db, data: bytes):
    """Put a copy back into an EMPTY database (never on top of live data). Returns how many documents per collection."""
    if [n for n in await target_db.list_collection_names() if not n.startswith("system.")]:
        raise ValueError("the target database is not empty: restore into a new database")
    counts = {}
    for name, doc in read(data):
        await target_db[name].insert_one(doc)
        counts[name] = counts.get(name, 0) + 1
    return counts
