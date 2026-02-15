/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENVIRONMENT: string
  readonly VITE_API_URL: string
  readonly VITE_API_TIMEOUT: string
  readonly VITE_API_RETRIES: string
  readonly VITE_KEYCLOAK_URL: string
  readonly VITE_KEYCLOAK_REALM: string
  readonly VITE_KEYCLOAK_CLIENT_ID: string
  readonly VITE_KEYCLOAK_REDIRECT_URI: string
  readonly VITE_CONTEXT_URL: string
  readonly VITE_ENABLE_I18N: string
  readonly VITE_ENABLE_MONITORING: string
  readonly VITE_ENABLE_DEBUG: string
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
