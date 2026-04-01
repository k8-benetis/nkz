# Security policy

## Supported versions

Security fixes are applied to the **default branch** (`main`) and released via the normal CI/CD image builds and tags. Older release branches may not receive backports unless explicitly announced.

## Reporting a vulnerability

**Please do not open a public GitHub issue** for security vulnerabilities.

1. Use **[GitHub Security Advisories](https://github.com/nkz-os/nkz/security/advisories/new)** to report issues privately to maintainers (preferred).
2. Include: affected component (service path, version or commit), reproduction steps, and impact assessment if known.

We aim to acknowledge reports in a reasonable timeframe and coordinate disclosure once a fix is available.

## Scope

This policy applies to code and default configurations in the **`nkz-os/nkz`** repository (core platform, services, host frontend). **External modules** under `nkz-os/*` have their own repositories; report issues in the affected repo or via the same advisory process if the vulnerability is cross-cutting.

## Secure development reminders (contributors)

- No hardcoded credentials; use environment variables and Kubernetes Secrets.
- No `verify=False` (or equivalent) for TLS in production paths.
- Validate JWT issuers and use explicit CORS allowlists on HTTP APIs serving browsers.
- See `CONTRIBUTING.md` and `docs/development/PLATFORM_CONVENTIONS.md` for platform rules.

_Organization owners may add a public security contact email later via PR to this file._
