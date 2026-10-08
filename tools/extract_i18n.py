"""Lists every sentence the app wraps in t("...") (the English text is the key).
Usage: python tools/extract_i18n.py [--check]   -> writes frontend/src/i18n/source.json
With --check it only reports, per language file, which sentences are still missing."""
import json, re, sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src"
pat = re.compile(r'\bt\(\s*"((?:[^"\\]|\\.)*)"')
extra = ["Chats", "Groups", "Profile"]  # used as t(label) in the bottom tabs
found = set(extra)
for f in list(SRC.rglob("*.jsx")) + list(SRC.rglob("*.js")):
    if "/i18n/" in str(f):
        continue
    for m in pat.finditer(f.read_text()):
        found.add(json.loads('"' + m.group(1) + '"'))
keys = sorted(found)
out = SRC / "i18n" / "source.json"
if "--check" in sys.argv:
    for p in sorted((SRC / "i18n" / "locales").glob("*.json")):
        d = json.loads(p.read_text())
        miss = [k for k in keys if k not in d]
        extra_keys = [k for k in d if k not in found]
        print(p.stem, "missing", len(miss), "unused", len(extra_keys))
else:
    out.write_text(json.dumps(keys, ensure_ascii=False, indent=1))
    print(len(keys), "sentences ->", out)
