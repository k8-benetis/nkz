# GitOps Configuration (ArgoCD)

This folder contains the declarative state of the Nekazari cluster.

## Structure
- **bootstrap/**: Contains the `root-app.yaml` which enables the "App of Apps" pattern.
- **core/**: Usage reserved for platform configurations (e.g., RBAC, NetworkPolicies).
- **modules/**: Place `Application` definitions here. ArgoCD Root App automatically detects and syncs them.

## Adding a New Module
1. Create a file `gitops/modules/<module-name>.yaml`.
2. Either point to this repo (`path: k8s/<module-name>`) or to the module repo (`repoURL: https://github.com/k8-benetis/<module-repo>`, `path: k8s`).
3. If the module needs env-specific config (e.g. API URL) that must not live in the public module repo, add an overlay in `gitops/overlays/<module-name>/` and a second Application in `gitops/modules/<module-name>-config.yaml` that syncs that overlay. Example: DataHub uses `datahub.yaml` (module repo) + `datahub-config.yaml` (overlay ConfigMap in this repo).
4. Commit and Push. ArgoCD will deploy automatically.
