#!/usr/bin/env python3
"""Merge activation + terms from legacy flat locale files into namespaced common.json.
Adds registration.* strings for /register flow. Run from repo root: python3 scripts/merge-activation-locale-gaps.py"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
LOCALES = REPO / "apps/host/public/locales"
BASE = "34c1fe2^"
LANGS = ["es", "en", "ca", "eu", "fr", "pt"]

# /register loading messages (not in legacy flat files)
REGISTRATION: dict[str, dict[str, str]] = {
    "es": {
        "processing": "Procesando registro...",
        "creating": "Creando cuenta y recursos...",
        "finalizing": "Finalizando configuración...",
        "registering": "Registrando...",
    },
    "en": {
        "processing": "Processing registration...",
        "creating": "Creating account and resources...",
        "finalizing": "Finalizing setup...",
        "registering": "Registering...",
    },
    "ca": {
        "processing": "Processant el registre...",
        "creating": "Creant el compte i els recursos...",
        "finalizing": "Finalitzant la configuració...",
        "registering": "Registrant...",
    },
    "eu": {
        "processing": "Erregistroa prozesatzen...",
        "creating": "Kontua eta baliabideak sortzen...",
        "finalizing": "Konfigurazioa amaitzen...",
        "registering": "Erregistratzen...",
    },
    "fr": {
        "processing": "Traitement de l'inscription...",
        "creating": "Création du compte et des ressources...",
        "finalizing": "Finalisation de la configuration...",
        "registering": "Inscription en cours...",
    },
    "pt": {
        "processing": "A processar registo...",
        "creating": "A criar conta e recursos...",
        "finalizing": "A concluir a configuração...",
        "registering": "A registar...",
    },
}


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


def fix_terms_interpolation(terms: dict) -> None:
    """i18next uses {{var}} for interpolation."""
    if not isinstance(terms, dict):
        return
    lu = terms.get("last_updated")
    if isinstance(lu, str) and "{date}" in lu and "{{date}}" not in lu:
        terms["last_updated"] = lu.replace("{date}", "{{date}}")


def deep_fill(dst: dict, src: dict) -> None:
    for k, v in src.items():
        if k not in dst:
            dst[k] = json.loads(json.dumps(v))
        elif isinstance(dst[k], dict) and isinstance(v, dict):
            deep_fill(dst[k], v)


def main() -> int:
    for lang in LANGS:
        common_path = LOCALES / lang / "common.json"
        flat = git_show(f"apps/host/public/locales/{lang}.json") or {}
        if not flat:
            print(f"skip no legacy flat for {lang}", flush=True)
            continue

        with open(common_path, encoding="utf-8") as f:
            common = json.load(f)

        if "activation" in flat and isinstance(flat["activation"], dict):
            if "activation" not in common:
                common["activation"] = {}
            deep_fill(common["activation"], flat["activation"])

        if "terms" in flat and isinstance(flat["terms"], dict):
            if "terms" not in common:
                common["terms"] = {}
            deep_fill(common["terms"], flat["terms"])
            fix_terms_interpolation(common["terms"])

        common["registration"] = REGISTRATION[lang]

        with open(common_path, "w", encoding="utf-8") as f:
            json.dump(common, f, ensure_ascii=False, indent=2)
            f.write("\n")

        print(f"updated {common_path.relative_to(REPO)}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
