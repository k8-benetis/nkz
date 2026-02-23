# Nekazari Module Template (platform copy)

> This directory mirrors the canonical public template at
> **[k8-benetis/nkz-module-template](https://github.com/k8-benetis/nkz-module-template)**.
>
> External developers should clone that repo. This copy exists inside the `nkz`
> monorepo so platform contributors have a local reference.

See the canonical repo's [README](https://github.com/k8-benetis/nkz-module-template/blob/main/README.md)
and [SETUP.md](https://github.com/k8-benetis/nkz-module-template/blob/main/SETUP.md) for full documentation.

## Quick start (platform developers)

```bash
cp -r module-template/ ../my-module
cd ../my-module
bash scripts/init-module.sh   # interactive placeholder replacement
npm install
npm run dev
```

## Structure

```
module-template/
├── src/
│   ├── moduleEntry.ts          # IIFE entry — calls window.__NKZ__.register()
│   ├── slots/index.ts          # Slot component declarations
│   ├── components/slots/       # Slot React components
│   ├── services/api.ts         # API client template
│   └── types/global.d.ts       # Host globals (window.__NKZ__, etc.)
├── backend/                    # FastAPI backend (optional)
├── k8s/
│   ├── backend-deployment.yaml
│   └── registration.sql
├── scripts/init-module.sh      # Interactive initializer
├── manifest.json
└── vite.config.ts              # Uses @nekazari/module-builder preset
```

## Build

```bash
npm run build:module
# → dist/nkz-module.js  (IIFE bundle, upload to MinIO)
```

See `SETUP.md` for full deployment steps.
