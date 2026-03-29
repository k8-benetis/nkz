#!/usr/bin/env python3
"""
One-off / repeatable: merge missing i18n blocks from pre-consolidation flat locale files
into namespaced common.json. Run from repo root: python3 scripts/merge-locale-gaps-from-history.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
LOCALES = REPO / "apps/host/public/locales"
# Commit before flat files were removed
BASE = "34c1fe2^"

LANGS = ["es", "en", "ca", "eu", "fr", "pt"]

# Top-level objects to pull from legacy flat JSON into common.json
BLOCKS = ["weather", "wizard", "livestock", "machines", "layout"]


def git_show(path: str) -> dict | None:
    try:
        raw = subprocess.check_output(
            ["git", "show", f"{BASE}:{path}"],
            cwd=REPO,
            stderr=subprocess.DEVNULL,
        )
        return json.loads(raw.decode("utf-8"))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def fill_missing(dst: dict, src: dict) -> None:
    """Fill keys present in src but missing in dst; recurse for nested dicts."""
    for k, v in src.items():
        if k not in dst:
            dst[k] = json.loads(json.dumps(v))  # deep copy primitives/dicts
        elif isinstance(dst[k], dict) and isinstance(v, dict):
            fill_missing(dst[k], v)


def main() -> int:
    en_flat = git_show("apps/host/public/locales/en.json") or {}

    for lang in LANGS:
        common_path = LOCALES / lang / "common.json"
        if not common_path.is_file():
            print(f"skip missing {common_path}", file=sys.stderr)
            continue

        flat = git_show(f"apps/host/public/locales/{lang}.json") or {}

        with open(common_path, encoding="utf-8") as f:
            common = json.load(f)

        for block in BLOCKS:
            src_obj = flat.get(block)
            if block == "wizard" and not src_obj:
                src_obj = en_flat.get("wizard")
            if not src_obj:
                continue
            if block not in common:
                common[block] = json.loads(json.dumps(src_obj))
            else:
                fill_missing(common[block], src_obj)

        # sensors: merge legacy strings (required_fields, form labels, etc.)
        if "sensors" in flat and isinstance(flat["sensors"], dict):
            if "sensors" not in common:
                common["sensors"] = {}
            fill_missing(common["sensors"], flat["sensors"])

        with open(common_path, "w", encoding="utf-8") as f:
            json.dump(common, f, ensure_ascii=False, indent=2)
            f.write("\n")

        print(f"updated {common_path.relative_to(REPO)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
