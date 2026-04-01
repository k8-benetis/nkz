# Contributing to Nekazari

Thank you for your interest in contributing. This repository is the **core platform** (`nkz-os/nkz`). The **public website and extended docs** live on **[nkz-os.org](https://nkz-os.org)** (Astro / Starlight). See also the **[roadmap](ROADMAP.md)** and **[security policy](SECURITY.md)**.

## Getting started

1. Fork the repository
2. Clone: `git clone https://github.com/your-username/nkz.git`
3. Create a branch (see **Branch naming** below)
4. Make changes with small, reviewable commits
5. Open a pull request (template will appear in the UI)

## Branch naming

Use prefixes so CI and reviewers scan history quickly:

| Prefix | Use for |
|--------|---------|
| `feat/` | New user-visible behavior or API |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `chore/` | Tooling, refactors without behavior change |
| `ci/` | GitHub Actions or pipeline |

Example: `feat/host-add-export-button`, `fix/api-gateway-cors`. Legacy `feature/` branches are fine but prefer the table above for new work.

## Development setup

### Full stack (recommended)

From the repo root:

```bash
cp .env.example .env
docker compose up -d
```

Wait for healthchecks, then follow [README.md](README.md) Quick Start (e.g. host on port 3000). Adjust `.env` for local auth and URLs.

### Git hooks (recommended)

To avoid accidentally adding Co-authored-by lines (e.g. from Cursor/Claude) to commits—which would show up as contributors on the public repo—enable the project hooks:

```bash
git config core.hooksPath .githooks
```

Or run once: `./scripts/setup-hooks.sh` if available. The `prepare-commit-msg` hook strips any Co-authored-by line from commit messages before the commit is created.

### Prerequisites

- **Node.js** 22.x (matches main CI; see `.github/workflows/test.yml`) and **pnpm**
- **Python** 3.11+
- **Docker** and Docker Compose (for integrated local dev)
- **Kubernetes** (optional — only if you work on manifests or cluster-only features; K3s is typical)

### Frontend (host only, against remote or partial backend)

```bash
cd apps/host
pnpm install
pnpm dev
```

### Backend Services

```bash
cd services/<service-name>
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Platform rules (mandatory for core changes)

- **FIWARE NGSI-LD**: Context Broker (Orion-LD) is the source of truth for digital twins. Do **not** bypass it with direct DB writes for twin data. Read **`docs/development/PLATFORM_CONVENTIONS.md`** before changing entity lifecycle, headers, or telemetry flows.
- **Smart Data Models**: Prefer standard SDM types and vocabulary; avoid ad-hoc entity models where an SDM exists.

## Code guidelines

- **Python**: PEP 8; type hints where practical.
- **TypeScript**: Strict mode; avoid `any` in new code where possible.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`). Do **not** add `Co-authored-by` lines for AI/agents on public commits; enable `.githooks` to strip them.
- **Security**: No hardcoded credentials; env vars + Secrets. No TLS `verify=False` in production paths.
- **Logging**: Appropriate levels; no leaking secrets in logs.
- **Host UI i18n**: User-visible strings through `t()` / react-i18next; add keys at least in **`es`** and **`en`** under `apps/host/public/locales/`.

## Pull requests — acceptance

- **CI**: Required checks green for the areas you touch (tests, lint, typecheck, Docker build when applicable).
- **Scope**: Prefer focused PRs; large features can be split or behind feature flags.
- **Docs**: Public files under `docs/` must include YAML frontmatter (`title`, `description`). Internal notes belong in `internal-docs/`, not public `docs/`.
- **Behavior**: Do not regress multi-tenant isolation or auth without explicit review.

## Reporting issues vs discussions

- **Bug / concrete feature** with repro or spec → **Issues** (use templates).
- **Security** → [Security Advisories](https://github.com/nkz-os/nkz/security/advisories/new).
- **Open design questions** → **GitHub Discussions** when enabled; see seed texts in `internal-docs/community/github-discussions-seeds.md`.

## Community standards

- [Code of Conduct](CODE_OF_CONDUCT.md)

## Module Development

Nekazari uses a modular architecture. To create a new module:

1. Use the `module-template/` as a starting point
2. Follow the [External Developer Guide](docs/development/EXTERNAL_DEVELOPER_GUIDE.md)
3. Modules integrate via predefined frontend slots: `entity-tree`, `map-layer`, `context-panel`, `bottom-panel`, `layer-toggle`

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
