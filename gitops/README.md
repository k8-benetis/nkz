# GitOps Configuration (ArgoCD)

This folder contains the declarative state of the Nekazari cluster.

## Structure
- **bootstrap/**: Contains the `root-app.yaml` which enables the "App of Apps" pattern.
- **core/**: Usage reserved for platform configurations (e.g., RBAC, NetworkPolicies).
- **modules/**: Place `Application` definitions here. ArgoCD Root App automatically detects and syncs them.

## Adding a New Module
1. Create a file `gitops/modules/<module-name>.yaml`.
2. Content:
   ```yaml
   apiVersion: argoproj.io/v1alpha1
   kind: Application
   metadata:
     name: <module-name>
     namespace: argocd
   spec:
     project: default
     source:
       repoURL: https://github.com/k8-benetis/nkz
       targetRevision: HEAD
       path: k8s/<module-name>
     destination:
       server: https://kubernetes.default.svc
       namespace: nekazari
     syncPolicy:
       automated:
         prune: true
         selfHeal: true
   ```
3. Commit and Push. ArgoCD will deploy it automatically.
