#!/usr/bin/env python3
"""Export real memories from the private BIMLabz/bot-memory repo (A0.2).

Each learning is one YAML block (see that repo's FORMAT.md: id, bot, date,
project, task, status, happened, wrong, worked, next, replaces). This script
fetches every markdown file via the GitHub API, extracts learning blocks,
dedups by content hash, and writes a JSONL import file shaped for
memory/schema/v1.sql.

Output: memory/spikes/A0/real-corpus.jsonl
Each line: {id, namespace, type, text, importance, content_hash, provenance}

Uses the stored custom.github credential; the raw secret never appears here.
Seeding to Neon is a separate step (needs a Neon connection string).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
sys.path.insert(0, os.path.expanduser("~/workspace/skills/github/bin"))
from gh_api import api  # noqa: E402

REPO = "BIMLabz/bot-memory"
OUT_PATH = "memory/spikes/A0/real-corpus.jsonl"
MAX_ROWS = 500

BLOCK_RE = re.compile(r"^---\n(.*?)\n---", re.MULTILINE | re.DOTALL)
KV_RE = re.compile(r"^([a-z_]+):\s*(.*)$")


def get_blob_b64(sha: str) -> bytes:
    blob = api("GET", f"/repos/{REPO}/git/blobs/{sha}")
    assert blob.get("encoding") == "base64", f"unexpected blob encoding: {blob.get('encoding')}"
    return base64.b64decode(blob["content"])


def parse_block(body: str) -> dict | None:
    fields: dict[str, str] = {}
    for line in body.splitlines():
        m = KV_RE.match(line.strip())
        if m:
            fields[m.group(1)] = m.group(2).strip()
    # A learning block carries an id and at least one narrative key.
    if "id" not in fields or not any(k in fields for k in ("happened", "worked", "wrong", "next", "bot")):
        return None
    return fields


def atomic_claims(f: dict[str, str]) -> list[tuple[str, str]]:
    """Split one learning block into atomic (type, text) claims.

    Maps onto schema v1 types: happened -> episodic, wrong/worked -> semantic,
    next/do/dont -> procedural.
    """
    claims: list[tuple[str, str]] = []
    happened = f.get("happened", "").strip()
    if happened:
        claims.append(("episodic", happened))
    lesson_parts = []
    wrong = f.get("wrong", "").strip()
    worked = f.get("worked", "").strip()
    if wrong:
        lesson_parts.append(f"Wrong: {wrong}")
    if worked:
        lesson_parts.append(f"Worked: {worked}")
    if lesson_parts:
        claims.append(("semantic", " ".join(lesson_parts)))
    proc_parts = []
    for key in ("do", "dont", "next"):
        val = f.get(key, "").strip()
        if val:
            label = {"do": "Do", "dont": "Don't", "next": "Next"}[key]
            proc_parts.append(f"{label}: {val}")
    if proc_parts:
        claims.append(("procedural", " ".join(proc_parts)))
    return claims


def main() -> int:
    tree = api("GET", f"/repos/{REPO}/git/trees/HEAD?recursive=1")
    md_blobs = [(x["path"], x["sha"]) for x in tree.get("tree", [])
                if x["type"] == "blob" and x["path"].endswith(".md")]
    print(f"{len(md_blobs)} markdown files", flush=True)

    seen: set[str] = set()
    rows: list[dict] = []
    blocks_total = 0
    claims_total = 0
    for path, sha in sorted(md_blobs):
        try:
            content = get_blob_b64(sha).decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001 - keep exporting the rest
            print(f"skip {path}: {exc}", flush=True)
            continue
        for m in BLOCK_RE.finditer(content):
            fields = parse_block(m.group(1))
            if not fields:
                continue
            blocks_total += 1
            project = fields.get("project", "").strip()
            bot = fields.get("bot", "").strip()
            namespace = f"project-{project}" if project else (f"bot-{bot}" if bot else "org.learnings")
            for mtype, raw_text in atomic_claims(fields):
                text = re.sub(r"\s+", " ", raw_text).strip()
                if len(text) < 20:
                    continue
                claims_total += 1
                digest = hashlib.sha256(text.lower().encode()).hexdigest()
                if digest in seen:
                    continue
                seen.add(digest)
                rows.append({
                    "id": f"bm-{digest[:16]}",
                    "namespace": namespace,
                    "type": mtype,
                    "text": text,
                    "importance": 5,
                    "content_hash": digest,
                    "provenance": {
                        "source_repo": REPO,
                        "source_path": path,
                        "yaml_id": fields.get("id"),
                        "bot": bot or None,
                        "project": project or None,
                        "date": fields.get("date"),
                        "status": fields.get("status"),
                    },
                })
                if len(rows) >= MAX_ROWS:
                    break
            if len(rows) >= MAX_ROWS:
                break
        if len(rows) >= MAX_ROWS:
            break

    rows = rows[:MAX_ROWS]
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    dupes = claims_total - len(seen)
    print(f"learning blocks found: {blocks_total}")
    print(f"atomic claims:         {claims_total}")
    print(f"duplicates dropped:    {dupes}")
    print(f"rows exported:         {len(rows)} -> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
