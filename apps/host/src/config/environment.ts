// =============================================================================
// Environment Configuration - Enterprise Grade
// =============================================================================

// Declaración de tipos para window.__ENV__ (runtime config desde K8s)
declare global {
  interface Window {
    __ENV__?: {
      API_URL?: string;
      KEYCLOAK_URL?: string;
      KEYCLOAK_REALM?: string;
      KEYCLOAK_CLIENT_ID?: string;
      TITILER_URL?: string;
      VITE_API_URL?: string;
      VITE_KEYCLOAK_URL?: string;
      VITE_KEYCLOAK_REALM?: string;
      VITE_KEYCLOAK_CLIENT_ID?: string;
      VITE_KEYCLOAK_REDIRECT_URI?: string;
      VITE_KEYCLOAK_ADMIN_URL?: string;
      VITE_CONTEXT_URL?: string;
      VITE_TITILER_URL?: string;
      VITE_GRAFANA_URL?: string;
      VITE_PROMETHEUS_URL?: string;
      VITE_ROS2_BRIDGE_URL?: string;
      VITE_GEOSERVER_URL?: string;
      VITE_TITILER_URL?: string;
      VITE_CESIUM_TOKEN?: string;
      VITE_OPENWEATHER_API_KEY?: string;
      VITE_MAPBOX_TOKEN?: string;
      VITE_ENABLE_I18N?: string;
      VITE_ENABLE_MONITORING?: string;
      VITE_ENABLE_DEBUG?: string;
      [key: string]: unknown;
    };
  }
}

/**
 * Environment Configuration Manager
 * 
 * This module provides a centralized, type-safe configuration system
 * that works across all environments (development, staging, production)
 * with proper validation and fallbacks.
 * 
 * Supports both:
 * 1. Runtime config (K8s): Variables injected in window.__ENV__ by entrypoint.sh
 * 2. Build-time config (Vite): Variables from import.meta.env
 */

export interface EnvironmentConfig {
  // API Configuration
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
  };
  
  // Keycloak Configuration
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
    redirectUri: string;
    adminUrl?: string;
  };
  
  // External Services
  external: {
    contextUrl: string;
    grafanaUrl?: string;
    prometheusUrl?: string;
    ros2BridgeUrl?: string;
    geoserverUrl?: string;
    titilerUrl?: string;
  };
  
  // Feature Flags
  features: {
    enableI18n: boolean;
    enableMonitoring: boolean;
    enableDebugMode: boolean;
  };
  
  // Environment Info
  environment: {
    name: 'development' | 'staging' | 'production';
    isDevelopment: boolean;
    isProduction: boolean;
  };
}

/**
 * Default configuration values (safe fallbacks)
 */
const DEFAULT_CONFIG: EnvironmentConfig = {
  api: {
    baseUrl: '',
    timeout: 30000,
    retries: 3,
  },
  keycloak: {
    url: 'http://localhost:8080',
    realm: 'nekazari',
    clientId: 'nekazari-frontend',
    redirectUri: window.location.origin,
  },
    external: {
      contextUrl: 'http://localhost/ngsi-ld-context.json',
      geoserverUrl: 'http://localhost/geoserver',
      titilerUrl: 'http://localhost:8000',
    },
  features: {
    enableI18n: true,
    enableMonitoring: false,
    enableDebugMode: false,
  },
  environment: {
    name: 'development',
    isDevelopment: true,
    isProduction: false,
  },
};

/**
 * Environment-specific configurations
 */
const ENVIRONMENT_CONFIGS = {
  development: {
    api: {
      baseUrl: '',
      timeout: 30000,
      retries: 3,
    },
    keycloak: {
      url: 'http://localhost:8080',
      realm: 'nekazari',
      clientId: 'nekazari-frontend',
      redirectUri: 'http://localhost:3000',
    },
    external: {
      contextUrl: 'http://localhost/ngsi-ld-context.json',
      ros2BridgeUrl: 'ws://localhost:9090',
    },
    features: {
      enableI18n: true,
      enableMonitoring: false,
      enableDebugMode: true,
    },
    environment: {
      name: 'development' as const,
      isDevelopment: true,
      isProduction: false,
    },
  },
  
  staging: {
    api: {
      baseUrl: '',
      timeout: 30000,
      retries: 3,
    },
    keycloak: {
      url: 'https://staging.nekazari.robotika.cloud',
      realm: 'nekazari',
      clientId: 'nekazari-frontend',
      redirectUri: 'https://staging.nekazari.robotika.cloud',
      adminUrl: 'https://staging.nekazari.robotika.cloud',
    },
    external: {
      contextUrl: 'https://staging.nekazari.robotika.cloud/ngsi-ld-context.json',
      grafanaUrl: 'https://staging.nekazari.robotika.cloud/grafana',
      prometheusUrl: 'https://staging.nekazari.robotika.cloud/prometheus',
      ros2BridgeUrl: 'wss://staging.nekazari.robotika.cloud/ros2-bridge',
      geoserverUrl: 'https://staging.nekazari.robotika.cloud/geoserver',
      titilerUrl: 'https://staging.nekazari.robotika.cloud/titiler',
    },
    features: {
      enableI18n: true,
      enableMonitoring: true,
      enableDebugMode: false,
    },
    environment: {
      name: 'staging' as const,
      isDevelopment: false,
      isProduction: false,
    },
  },
  
  production: {
    api: {
      baseUrl: '', // API uses relative URLs - configured via VITE_API_URL
      timeout: 30000,
      retries: 3,
    },
    keycloak: {
      url: '', // Must be set via VITE_KEYCLOAK_URL
      realm: 'nekazari', // Can be overridden via VITE_KEYCLOAK_REALM
      clientId: 'nekazari-frontend', // Can be overridden via VITE_KEYCLOAK_CLIENT_ID
      redirectUri: '', // Will use window.location.origin or VITE_KEYCLOAK_REDIRECT_URI
      adminUrl: '', // Will use VITE_KEYCLOAK_ADMIN_URL or VITE_KEYCLOAK_URL
    },
    external: {
      contextUrl: '', // Must be set via VITE_CONTEXT_URL
      grafanaUrl: '', // Must be set via VITE_GRAFANA_URL
      prometheusUrl: '', // Must be set via VITE_PROMETHEUS_URL
      ros2BridgeUrl: '', // Must be set via VITE_ROS2_BRIDGE_URL
      geoserverUrl: '', // Must be set via VITE_GEOSERVER_URL
      titilerUrl: '', // Must be set via VITE_TITILER_URL
    },
    features: {
      enableI18n: true,
      enableMonitoring: true,
      enableDebugMode: false,
    },
    environment: {
      name: 'production' as const,
      isDevelopment: false,
      isProduction: true,
    },
  },
};

/**
 * Get environment name from Vite environment variables
 */
function getEnvironmentName(): 'development' | 'staging' | 'production' {
  const env = import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE;
  
  switch (env) {
    case 'production':
    case 'prod':
      return 'production';
    case 'staging':
    case 'stage':
      return 'staging';
    case 'development':
    case 'dev':
    default:
      return 'development';
  }
}

/**
 * Get environment variable with runtime config support
 * Priority: window.__ENV__ > import.meta.env > defaultValue
 */
function getEnvVar(key: string, defaultValue: string = ''): string {
  // 1. Runtime config (K8s) - highest priority
  if (typeof window !== 'undefined' && window.__ENV__) {
    const runtimeValue = (window.__ENV__ as Record<string, unknown>)[key];
    if (runtimeValue !== undefined && runtimeValue !== null && runtimeValue !== '') {
      return String(runtimeValue);
    }
  }
  
  // 2. Build-time config (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const buildValue = (import.meta.env as Record<string, unknown>)[key];
    if (buildValue !== undefined && buildValue !== null && buildValue !== '') {
      return String(buildValue);
    }
  }
  
  // 3. Default value
  return defaultValue;
}

/**
 * Load configuration from environment variables
 */
function loadEnvironmentConfig(): Partial<EnvironmentConfig> {
  const env = getEnvironmentName();
  const isProduction = env === 'production';
  
  // All URLs must come from environment variables - no hardcoded defaults
  // For development, use localhost defaults if not set
  const defaultKeycloakUrl = isProduction ? '' : 'http://localhost:8080/auth';
  const defaultContextUrl = isProduction ? '' : 'http://localhost/ngsi-ld-context.json';
  const defaultGeoserverUrl = isProduction ? '' : 'http://localhost/geoserver';
  const defaultTitilerUrl = isProduction ? '' : 'http://localhost:8000';
  
  return {
    api: {
      baseUrl: getEnvVar('VITE_API_URL', ''),
      timeout: parseInt(getEnvVar('VITE_API_TIMEOUT', '30000')),
      retries: parseInt(getEnvVar('VITE_API_RETRIES', '3')),
    },
    keycloak: {
      url: getEnvVar('VITE_KEYCLOAK_URL', defaultKeycloakUrl),
      realm: getEnvVar('VITE_KEYCLOAK_REALM', 'nekazari'),
      clientId: getEnvVar('VITE_KEYCLOAK_CLIENT_ID', 'nekazari-frontend'),
      redirectUri: getEnvVar('VITE_KEYCLOAK_REDIRECT_URI', window.location.origin),
      adminUrl: getEnvVar('VITE_KEYCLOAK_ADMIN_URL', getEnvVar('VITE_KEYCLOAK_URL', defaultKeycloakUrl)),
    },
    external: {
      contextUrl: getEnvVar('VITE_CONTEXT_URL', defaultContextUrl),
      grafanaUrl: getEnvVar('VITE_GRAFANA_URL', ''),
      prometheusUrl: getEnvVar('VITE_PROMETHEUS_URL', ''),
      ros2BridgeUrl: getEnvVar('VITE_ROS2_BRIDGE_URL', ''),
      geoserverUrl: getEnvVar('VITE_GEOSERVER_URL', defaultGeoserverUrl),
      titilerUrl: getEnvVar('VITE_TITILER_URL', defaultTitilerUrl),
    },
    features: {
      enableI18n: getEnvVar('VITE_ENABLE_I18N', 'true') === 'true',
      enableMonitoring: getEnvVar('VITE_ENABLE_MONITORING', 'false') === 'true',
      enableDebugMode: getEnvVar('VITE_ENABLE_DEBUG', 'false') === 'true',
    },
    environment: {
      name: env,
      isDevelopment: env === 'development',
      isProduction: env === 'production',
    },
  };
}

/**
 * Merge configurations with proper precedence:
 * 1. Environment variables (highest priority)
 * 2. Environment-specific defaults
 * 3. Global defaults (lowest priority)
 */
function mergeConfigurations(): EnvironmentConfig {
  const envName = getEnvironmentName();
  const envConfig = loadEnvironmentConfig();
  const envDefaults = ENVIRONMENT_CONFIGS[envName];
  
  return {
    ...DEFAULT_CONFIG,
    ...envDefaults,
    ...envConfig,
  } as EnvironmentConfig;
}

/**
 * Validate configuration
 */
function validateConfig(config: EnvironmentConfig): void {
  const errors: string[] = [];
  
  // Validate API configuration
  // NOTE: API base URL is optional in production - services may use relative URLs
  // if (!config.api.baseUrl && config.environment.isProduction) {
  //   errors.push('API base URL is required in production');
  // }
  
  // Validate Keycloak configuration
  if (!config.keycloak.url) {
    errors.push('Keycloak URL is required (set VITE_KEYCLOAK_URL)');
  }
  
  if (!config.keycloak.realm) {
    // Default realm
    config.keycloak.realm = 'nekazari';
  }
  
  if (!config.keycloak.clientId) {
    // Default client ID
    config.keycloak.clientId = 'nekazari-frontend';
  }
  
  // Validate external services
  // In production, context URL is optional - can use relative URLs
  // Only validate in development
  if (!config.external.contextUrl && config.environment.isDevelopment) {
    console.warn('[Config] Context URL not set - using default');
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation failed:', errors);
    // Don't throw in production - use defaults
    if (config.environment.isDevelopment) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }
}

/**
 * Main configuration instance
 */
let configInstance: EnvironmentConfig | null = null;

/**
 * Get the application configuration
 */
export function getConfig(): EnvironmentConfig {
  if (!configInstance) {
    configInstance = mergeConfigurations();
    validateConfig(configInstance);
  }
  
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Get a specific configuration value
 */
export function getConfigValue<K extends keyof EnvironmentConfig>(
  key: K
): EnvironmentConfig[K] {
  return getConfig()[key];
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof EnvironmentConfig['features']): boolean {
  return getConfig().features[feature];
}

/**
 * Get environment information
 */
export function getEnvironmentInfo() {
  return getConfig().environment;
}

// Export the main configuration
export const config = getConfig();
