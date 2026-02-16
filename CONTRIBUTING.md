# Contributing to Nekazari

Thank you for your interest in contributing to Nekazari. This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/nkz.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Make your changes
5. Submit a pull request

## Development Setup

### Git hooks (recommended)

To avoid accidentally adding Co-authored-by lines (e.g. from Cursor/Claude) to commits—which would show up as contributors on the public repo—enable the project hooks:

```bash
git config core.hooksPath .githooks
```

Or run once: `./scripts/setup-hooks.sh` if available. The `prepare-commit-msg` hook strips any Co-authored-by line from commit messages before the commit is created.

### Prerequisites

- Node.js 18+ and pnpm
- Python 3.11+
- Docker
- Kubernetes cluster (K3s recommended for development)

### Frontend

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

## Code Guidelines

- **Python**: Follow PEP 8. Use type hints where practical.
- **TypeScript**: Use strict mode. Avoid `any` types.
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.). Do not add Co-authored-by lines for AI/agents; the project hook removes them automatically if enabled.
- **Security**: Never hardcode credentials, API keys, or secrets. Use environment variables.
- **Logging**: Use appropriate log levels. No `console.log()` or `print()` in production code.

## Module Development

Nekazari uses a modular architecture. To create a new module:

1. Use the `module-template/` as a starting point
2. Follow the [External Developer Guide](docs/development/EXTERNAL_DEVELOPER_GUIDE.md)
3. Modules integrate via predefined frontend slots: `entity-tree`, `map-layer`, `context-panel`, `bottom-panel`, `layer-toggle`

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Tag issues appropriately (`bug`, `enhancement`, `documentation`)

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
