# Nekazari platform roadmap (high level)

Strategic direction for the **core open-source platform** in [`nkz-os/nkz`](https://github.com/nkz-os/nkz). This file is a **public executive summary**. Detailed operational backlog and MAP tasks may live in internal planning documents; **product documentation and marketing** are published on **[nkz-os.org](https://nkz-os.org)** (Astro / Starlight).

Timelines are indicative and shift with community and release cadence.

---

## 2026 — Quarterly focus

### Q1 — Stability & trust

- Harden **multi-tenant auth**, observability, and CI so external contributors can reproduce builds reliably.
- **i18n** and host UX consistency across core pages.
- **Telemetry path**: Orion-LD → subscriptions → Timescale / reader APIs stable for dashboards (e.g. DataHub).
- Security hygiene: documented reporting ([SECURITY.md](SECURITY.md)), dependency and secret practices in CONTRIBUTING.

### Q2 — Digital twin & data plane

- Deepen **FIWARE NGSI-LD** alignment and **Smart Data Models** usage across core flows.
- **DataHub** and time-series consumption as the first-class “data cockpit” for operators (with clear deploy and module UX).
- Edge / device story: clearer docs and examples for **MQTT / IoT Agent** integration (not inventing parallel data models).
- Performance and cost awareness for heavy geospatial / raster workloads (vegetation, tiles).

### Q3 — Ecosystem & modules

- **Module marketplace** and **external module** experience: template, CI patterns, GHCR, GitOps examples.
- Strategic modules (ERP, automation, elevation, LiDAR) move toward **demo-ready** end-to-end stories where the org invests.
- “Minimum adoptable product” narratives reflected on **nkz-os.org** and in release notes.

### Q4 — Scale & adoption

- Packaging and operations options that teams can run without bespoke scripts (e.g. Helm or documented reference GitOps), where feasible.
- Community growth: `good first issue` / `help wanted`, discussions, and contributor path from first PR to module author.
- Long-horizon R&D (e.g. advanced robotics, regulatory tooling) **only** where aligned with maintainability.

---

## How to contribute to the roadmap

- **Bugs and features:** [GitHub Issues](https://github.com/nkz-os/nkz/issues) with the provided templates.
- **Broader product discussion:** GitHub **Discussions** (when enabled on this repo) or documentation updates proposed via PR.
- **NGSI-LD and conventions:** always read `docs/development/PLATFORM_CONVENTIONS.md` before proposing data-layer changes.

---

## Disclaimer

Roadmap items are aspirations, not guarantees. The maintainers may reprioritize for security, compliance, or sustainability of the core platform.
