# GitHub Discussions — seed posts (copy/paste)

Enable **Discussions** in repo **Settings → General → Features**. Pin these three after creation.

Language: English (community-facing). Maintain a Spanish mirror only if you add a dedicated category.

---

## 1. Welcome / Introduce yourself

**Title:** `Welcome — introduce yourself`

**Body:**

```markdown
Welcome to the NKZ OS / Nekazari community.

This thread is for quick intros: who you are, what you work on (farm, research, integration, FIWARE, robotics…), and what you hope to build or learn with the platform.

- For **bugs** or **features** in the core repo, please use **Issues** with the templates.
- For **security**, use [GitHub Security Advisories](https://github.com/nkz-os/nkz/security/advisories/new) — never post vulnerabilities publicly.

Be kind; our [Code of Conduct](https://github.com/nkz-os/nkz/blob/main/CODE_OF_CONDUCT.md) applies here.

**Documentation & website:** [nkz-os.org](https://nkz-os.org)
```

---

## 2. Architecture Q&A

**Title:** `Architecture Q&A — stack, FIWARE, Kubernetes`

**Body:**

```markdown
Use this category for **design and architecture questions**: NGSI-LD and Orion-LD, the API gateway, Keycloak, React host + module slots, CesiumJS, MQTT / IoT Agent, Timescale / telemetry, Kubernetes, etc.

**Before posting**, skim:
- [Platform conventions](https://github.com/nkz-os/nkz/blob/main/docs/development/PLATFORM_CONVENTIONS.md) (auth, NGSI-LD, routes)
- [ROADMAP](https://github.com/nkz-os/nkz/blob/main/ROADMAP.md) (strategic direction)

**Not for:** production incident response or confidential security details (use private reporting). **Not for:** opening feature requests without context — those often work better as Issues once you have a clear proposal.

Maintainers and experienced contributors will answer when they can; community answers are welcome if they stay accurate and respectful.
```

---

## 3. Show and Tell

**Title:** `Show and tell — your deployments & integrations`

**Body:**

```markdown
Share **screenshots or short descriptions** of Nekazari in use: your farm, lab, cooperative, or demo environment — maps, dashboards, modules, or integrations you built.

Please:
- Do **not** post secrets, API keys, tenant IDs you care about, or private URLs.
- Mention roughly **what Nekazari version or image** you run (e.g. main / tagged release) if you know it.

This is for inspiration and community credit — not official support. For problems, open an **Issue** with repro steps.

**Public docs:** [nkz-os.org](https://nkz-os.org)
```
