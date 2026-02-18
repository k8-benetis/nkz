/// <reference types="vite/client" />

// @nekazari/ui-kit does not ship .d.ts files yet
declare module '@nekazari/ui-kit' {
  import { FC, ReactNode } from 'react';
  type PassthroughProps = { [key: string]: unknown };
  export const Card: FC<{ children?: ReactNode; className?: string } & PassthroughProps>;
  export const Button: FC<{ children?: ReactNode; className?: string; onClick?: () => void } & PassthroughProps>;
  export const Input: FC<PassthroughProps>;
  export const Badge: FC<{ children?: ReactNode } & PassthroughProps>;
  export const Dialog: FC<{ children?: ReactNode } & PassthroughProps>;
  export const Tabs: FC<{ children?: ReactNode } & PassthroughProps>;
  export const TabsList: FC<{ children?: ReactNode } & PassthroughProps>;
  export const TabsTrigger: FC<{ children?: ReactNode; value: string } & PassthroughProps>;
  export const TabsContent: FC<{ children?: ReactNode; value: string } & PassthroughProps>;
  const _default: Record<string, unknown>;
  export default _default;
}

/** Vite / build-time and runtime-injectable env vars (see config/environment.ts) */
interface ImportMetaEnv {
  readonly MODE: string;
  readonly VITE_API_URL: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_API_RETRIES?: string;
  readonly VITE_KEYCLOAK_URL?: string;
  readonly VITE_KEYCLOAK_REALM?: string;
  readonly VITE_KEYCLOAK_CLIENT_ID?: string;
  readonly VITE_KEYCLOAK_REDIRECT_URI?: string;
  readonly VITE_KEYCLOAK_ADMIN_URL?: string;
  readonly VITE_CONTEXT_URL?: string;
  readonly VITE_GEOSERVER_URL?: string;
  readonly VITE_TITILER_URL?: string;
  readonly VITE_GRAFANA_URL?: string;
  readonly VITE_PROMETHEUS_URL?: string;
  readonly VITE_ROS2_BRIDGE_URL?: string;
  readonly VITE_ENABLE_I18N?: string;
  readonly VITE_ENABLE_MONITORING?: string;
  readonly VITE_ENABLE_DEBUG?: string;
  readonly VITE_ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Cesium global — full typings would require fixing CesiumMap/use3DTiles/etc. to match cesium package
interface Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Cesium API varies; strict type breaks existing usage
  Cesium: any;
  __ENV__?: {
    [key: string]: unknown;
  };
  __REACT_MOUNTED__?: boolean;
  getEnvVar?: (key: string, defaultValue?: string) => string;
}
