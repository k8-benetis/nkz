## Summary

<!-- What does this PR do and why? Link issues: Fixes #… / Related to #… -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation only
- [ ] CI / tooling

## Checklist

- [ ] **No secrets** in code, env samples, or docs (no passwords, API keys, private URLs that are not already public).
- [ ] **CI** — relevant workflows pass locally where applicable (lint, tests, typecheck).
- [ ] **FIWARE NGSI-LD** — no direct `INSERT`/`UPDATE` to historical DB for digital-twin data; broker + subscriptions remain source of truth where applicable (see `docs/development/PLATFORM_CONVENTIONS.md`).
- [ ] **Host UI** — user-facing strings use `t()` / i18n namespaces; keys added for **es** + **en** at minimum.
- [ ] **Documentation** — public `docs/` files include YAML frontmatter (`title`, `description`) if added/changed.

## Screenshots / notes

<!-- Optional: UI before/after, API samples -->
