/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Cesium global declaration
interface Window {
  Cesium: any;
  __ENV__?: {
    [key: string]: unknown;
  };
  __REACT_MOUNTED__?: boolean;
  getEnvVar?: (key: string, defaultValue?: string) => string;
}
