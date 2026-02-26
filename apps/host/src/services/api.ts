// =============================================================================
// API Service - HTTP Client for Nekazari Backend
// =============================================================================

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import type {
  Robot,
  Sensor,
  Parcel,
  AgriculturalMachine,
  LivestockAnimal,
  WeatherStation,
  NDVIJob,
  NDVIResult,
  AssetCreationPayload,
  GeoPolygon,
  TenantLimits,
  TenantUsageSummary,
  GrafanaLink,
  RiskCatalog,
  RiskSubscription,
  RiskState,
  RiskWebhook,
  EntityInventory,
} from '@/types';
import { getConfig } from '@/config/environment';
import { logger } from '@/utils/logger';

const config = getConfig();
const API_BASE_URL = config.api.baseUrl;

/** Tenant user as returned by /api/tenant/users */
export interface TenantUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  username?: string;
  enabled?: boolean;
}

/** Response shape for /api/tenant/users (list) */
export interface TenantUsersResponse {
  users?: TenantUser[];
  [key: string]: unknown;
}

// Function to get current token (from Keycloak or sessionStorage fallback)
const getAuthToken = (): string | null => {
  // Try to get token from Keycloak instance if available
  if (typeof window !== 'undefined') {
    const keycloakInstance = (window as Window & { keycloak?: { token?: string } }).keycloak;
    if (keycloakInstance?.token) {
      return keycloakInstance.token;
    }
  }
  // Fallback to sessionStorage
  return sessionStorage.getItem('auth_token');
};

// =============================================================================
// Simple in-memory cache for API responses
// =============================================================================

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 60000;

  get<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T = unknown>(key: string, data: T, ttl: number = this.defaultTTL): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

// =============================================================================
// Retry utility
// =============================================================================

async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const err = error as { response?: { status?: number } };

      if (err.response && err.response.status != null && err.response.status >= 400 && err.response.status < 500) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

class ApiService {
  private client: AxiosInstance;
  private cache: SimpleCache;

  constructor() {
    this.cache = new SimpleCache();
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: config.api.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token and refresh if needed
    this.client.interceptors.request.use(
      async (requestConfig) => {
        // Log NDVI requests for debugging
        if (requestConfig.url?.includes('/api/ndvi/')) {
          logger.debug(`[API] NDVI request interceptor: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`);
        }
        // Get Keycloak instance to refresh token if needed
        let token = getAuthToken();

        if (typeof window !== 'undefined') {
          const keycloakInstance = (window as any).keycloak;
          if (keycloakInstance) {
            // Check if token is expired or about to expire (within 60 seconds)
            try {
              if (keycloakInstance.token) {
                const decoded = JSON.parse(atob(keycloakInstance.token.split('.')[1]));
                const exp = decoded.exp * 1000; // Convert to milliseconds
                const now = Date.now();
                const timeUntilExpiry = exp - now;

                // Refresh if token is expired (negative time) or expires in less than 60 seconds
                // Use 60 seconds buffer to avoid race conditions
                if (timeUntilExpiry < 60000) {
                  if (timeUntilExpiry < 0) {
                    logger.debug(`[API] Token expired ${Math.abs(timeUntilExpiry / 1000).toFixed(0)} seconds ago, refreshing...`);
                  } else {
                    logger.debug(`[API] Token expiring in ${(timeUntilExpiry / 1000).toFixed(0)} seconds, refreshing...`);
                  }
                  try {
                    // updateToken will refresh the token if needed
                    // Pass a longer min validity to ensure we get a fresh token
                    await keycloakInstance.updateToken(60);
                    // Always use the token from Keycloak instance after updateToken
                    // (it refreshes internally even if it returns false)
                    if (keycloakInstance.token) {
                      token = keycloakInstance.token;
                      logger.debug('[API] Token refreshed successfully');
                    } else {
                      logger.warn('[API] updateToken completed but no token available');
                      // Token refresh may have failed - this will cause 401 which will be handled by response interceptor
                    }
                  } catch (refreshError: unknown) {
                    logger.warn('[API] Token refresh failed:', refreshError);
                    // If refresh fails, try to get current token anyway
                    token = keycloakInstance.token || token;
                    // If still no token, the request will fail with 401
                    // and the response interceptor will try again
                    if (!token) {
                      logger.error('[API] No token available after refresh attempt - request may fail');
                    }
                  }
                } else {
                  // Token is still valid, use it
                  token = keycloakInstance.token;
                }
              } else {
                // No token in instance - try to get one
                logger.warn('[API] Keycloak instance exists but no token available');
                try {
                  await keycloakInstance.updateToken(60);
                  token = keycloakInstance.token || null;
                } catch (e) {
                  logger.warn('[API] Failed to get token from Keycloak instance:', e);
                }
              }
            } catch (e) {
              logger.warn('[API] Error checking token expiry:', e);
              token = keycloakInstance.token || token;
            }
          }
        }

        if (token) {
          requestConfig.headers.Authorization = `Bearer ${token}`;
          // Extract tenant from token for services that need X-Tenant-ID header
          // Note: Most services extract tenant from JWT token, but some legacy services
          // may still use X-Tenant-ID header for internal propagation
          try {
            const decoded = JSON.parse(atob(token.split('.')[1]));
            const tenantId = decoded['tenant-id'] || decoded.tenant_id || decoded.tenantId || decoded.tenant || '';
            if (tenantId) {
              requestConfig.headers['X-Tenant-ID'] = tenantId;
            }
          } catch (e) {
            // If token decode fails, continue without X-Tenant-ID header
            // Backend services should extract tenant from JWT token anyway
            logger.warn('[API] Could not extract tenant from token for X-Tenant-ID header');
          }
        } else {
          // Log when token is missing for weather endpoints
          if (requestConfig.url?.includes('/api/weather')) {
            logger.warn('[API] No token available for weather request:', requestConfig.url);
          }
        }

        // Log weather requests for debugging
        if (requestConfig.url?.includes('/api/weather')) {
          logger.debug(`[API] Weather request: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`, {
            hasToken: !!token,
            tokenLength: token ? token.length : 0,
            hasTenant: !!requestConfig.headers['X-Tenant-ID'],
          });
        }
        if (requestConfig.url?.includes('/api/ndvi/')) {
          logger.debug(`[API] NDVI request ready: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`, {
            hasToken: !!token,
            hasTenant: !!requestConfig.headers['X-Tenant-ID'],
          });
        }
        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling and token refresh
    this.client.interceptors.response.use(
      (response) => {
        // Log successful responses for debugging
        if (response.config.url?.includes('/api/ndvi/')) {
          logger.debug(`[API] NDVI request successful: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        }
        return response;
      },
      async (error: AxiosError) => {
        // Log all errors for NDVI requests
        if (error.config?.url?.includes('/api/ndvi/')) {
          logger.error(`[API] NDVI request error: ${error.config.method?.toUpperCase()} ${error.config.url}`, {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            responseData: error.response?.data,
            requestData: error.config?.data,
          });
        }
        // Handle empty responses or non-JSON responses
        if (error.response && typeof error.response.data === 'string' && error.response.data.trim() === '') {
          logger.warn('[API] Empty response received, converting to error object');
          error.response.data = { error: 'Empty response from server' };
        }

        // Handle JSON parse errors
        if (error.message && error.message.includes('JSON')) {
          logger.warn('[API] JSON parse error:', error.message);
          if (error.response) {
            try {
              // Try to parse the response as text first
              const text = typeof error.response.data === 'string'
                ? error.response.data
                : JSON.stringify(error.response.data);
              error.response.data = { error: text || 'Invalid response format' };
            } catch (e) {
              error.response.data = { error: 'Failed to parse server response' };
            }
          }
        }

        if (error.response?.status === 401) {
          // Log 401 errors for weather endpoints
          if (error.config?.url?.includes('/api/weather')) {
            const authHeader = error.config.headers?.Authorization;
            const authHeaderStr = typeof authHeader === 'string' ? authHeader : String(authHeader || '');
            logger.error('[API] 401 error for weather request:', {
              url: error.config.url,
              hasToken: !!authHeader,
              tokenLength: authHeaderStr.length || 0,
            });
          }

          // CRÍTICO: Prevenir bucles infinitos de refresh
          // Usar una propiedad en el config para rastrear intentos de refresh
          const retryCount = (error.config as any)?._retryCount || 0;
          const MAX_RETRY_ATTEMPTS = 2; // Máximo 2 intentos de refresh

          if (retryCount >= MAX_RETRY_ATTEMPTS) {
            logger.error('[API] Max retry attempts reached for 401 error. Stopping retry loop.', {
              url: error.config?.url,
              retryCount,
            });
            // Dejar que el error se propague - el componente manejará el redirect a login
            return Promise.reject(error);
          }

          // Token expired or invalid - try to refresh
          if (typeof window !== 'undefined') {
            const keycloakInstance = (window as any).keycloak;
            if (keycloakInstance) {
              try {
                logger.debug(`[API] 401 error, attempting to refresh token... (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
                // Always try to update token - Keycloak handles refresh internally
                await keycloakInstance.updateToken(30);
                if (keycloakInstance.token) {
                  logger.debug('[API] Token refreshed, retrying request...');
                  // Retry the original request with new token
                  const originalRequest = error.config;
                  if (originalRequest && originalRequest.headers) {
                    // Marcar este intento de retry
                    (originalRequest as AxiosRequestConfig & { _retryCount?: number })._retryCount = retryCount + 1;
                    originalRequest.headers.Authorization = `Bearer ${keycloakInstance.token}`;
                    // Actualizar también sessionStorage para consistencia
                    sessionStorage.setItem('auth_token', keycloakInstance.token);
                    // Clear any cached response to force retry
                    delete originalRequest.transformRequest;
                    delete originalRequest.transformResponse;
                    return this.client.request(originalRequest);
                  } else {
                    logger.warn('[API] Cannot retry: original request config is invalid');
                  }
                } else {
                  logger.warn('[API] Token refresh completed but no token available - user may need to re-authenticate');
                }
              } catch (refreshError: unknown) {
                logger.warn('[API] Token refresh failed:', refreshError);
                const err = refreshError as { error?: string; error_description?: string };
                if (err.error === 'login_required' || err.error_description?.includes('login')) {
                  logger.debug('[API] User needs to re-login');
                }
              }
            } else {
              logger.warn('[API] 401 error but Keycloak instance not available');
            }
          }

          // Token expired or invalid
          // CRÍTICO: NO redirigir automáticamente aquí porque puede causar bucles
          // Dejar que el componente de autenticación maneje esto
          const token = getAuthToken();
          if (!token) {
            logger.warn('[API] 401 error but no token found - may be loading');
          } else {
            logger.warn('[API] 401 error with token - token may be expired');
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // =============================================================================
  // HTTP Methods
  // =============================================================================

  async get(url: string, config?: AxiosRequestConfig) {
    return this.client.get(url, config);
  }

  async post(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.post(url, data, config);
  }

  async put(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.put(url, data, config);
  }

  async patch(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.patch(url, data, config);
  }

  async delete(url: string, config?: AxiosRequestConfig) {
    return this.client.delete(url, config);
  }

  // Authentication is now handled by Keycloak
  // These methods are kept for backward compatibility with backend APIs

  // I18N is now handled entirely in the frontend via I18nContext
  // Translations are loaded from /locales/*.json files
  // No backend service needed

  async updateUserProfile(firstName: string, lastName?: string): Promise<TenantUser | unknown> {
    const response = await this.client.put('/api/tenant/users/me', {
      firstName: firstName.trim(),
      lastName: lastName?.trim() || ''
    });
    return response.data as TenantUser;
  }

  async getTenantUsers(): Promise<TenantUsersResponse> {
    const response = await this.client.get('/api/tenant/users');
    return response.data as TenantUsersResponse;
  }

  async createTenantUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    password: string;
    temporary?: boolean;
  }): Promise<TenantUser | unknown> {
    const response = await this.client.post('/api/tenant/users', userData);
    return response.data as TenantUser;
  }

  async updateTenantUser(userId: string, updates: {
    firstName?: string;
    lastName?: string;
    email?: string;
  }): Promise<TenantUser | unknown> {
    const response = await this.client.put(`/api/tenant/users/${userId}`, updates);
    return response.data as TenantUser;
  }

  async deleteTenantUser(userId: string): Promise<unknown> {
    const response = await this.client.delete(`/api/tenant/users/${userId}`);
    return response.data;
  }

  async resetTenantUserPassword(userId: string): Promise<unknown> {
    const response = await this.client.post(`/api/tenant/users/${userId}/reset-password`);
    return response.data;
  }

  async updateTenantUserRoles(userId: string, roles: string[]): Promise<unknown> {
    const response = await this.client.put(`/api/tenant/users/${userId}/roles`, { roles });
    return response.data;
  }

  // Entities - Robots
  async getRobots(): Promise<Robot[]> {
    try {
      const response = await this.client.get('/ngsi-ld/v1/entities', {
        params: { type: 'AgriculturalRobot' },
        headers: { 'Accept': 'application/ld+json' },
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('Error fetching robots:', error);
      return [];
    }
  }

  async createRobot(robot: Partial<Robot>): Promise<Robot> {
    const response = await this.client.post('/ngsi-ld/v1/entities', robot, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
      },
    });
    return response.data;
  }

  async updateRobot(id: string, updates: Partial<Robot>): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, updates, {
      headers: { 'Content-Type': 'application/ld+json' },
    });
  }

  // =============================================================================
  // Sensor Management Methods - Using new API endpoints
  // =============================================================================

  async getSensors(): Promise<Sensor[]> {
    try {
      // Try new API endpoint first
      const response = await this.client.get('/api/sensors');
      if (response.data?.sensors) {
        // Transform from DB format to NGSI-LD format for frontend
        return response.data.sensors.map((s: any) => {
          return {
            id: s.id,
            type: 'AgriSensor',
            name: {
              type: 'Property',
              value: s.name || s.external_id
            },
            location: s.location?.value || s.location,
            external_id: s.external_id,
            profile: s.profile
          };
        });
      }
      // Fallback to NGSI-LD endpoint
      const ngsiResponse = await this.client.get('/ngsi-ld/v1/entities', {
        params: { type: 'AgriSensor' },
        headers: { 'Accept': 'application/ld+json' },
      });
      const sensors = Array.isArray(ngsiResponse.data) ? ngsiResponse.data : (ngsiResponse.data.results || []);

      return sensors.map((s: any) => {
        // Normalize location from simple NGSI-LD or normalized format
        const location = s.location?.value || s.location;

        return {
          id: s.id,
          name: s.name?.value || s.name || s['https://smartdatamodels.org/name']?.value || 'Unnamed Sensor',
          type: s.sensorType?.value || s.sensorType || 'generic',
          location: location,
          batteryLevel: s.batteryLevel?.value || s.batteryLevel || 100,
          status: s.status?.value || s.status || 'active',
          lastUpdate: s.modifiedAt || new Date().toISOString(),
          measurements: {
            temperature: s.temperature?.value || s.temperature || 0,
            humidity: s.humidity?.value || s.humidity || 0
          }
        };
      });
    } catch (error) {
      logger.warn('Error fetching sensors:', error);
      return [];
    }
  }

  async getSensorProfiles(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/sensors/profiles');
      return response.data?.profiles || [];
    } catch (error) {
      logger.warn('Error fetching sensor profiles:', error);
      return [];
    }
  }

  async getSensorProfilesStatus(): Promise<{
    initialized: boolean;
    global_profiles: number;
    tenant_profiles: number;
    total: number;
  }> {
    try {
      const response = await this.client.get('/api/sensors/profiles/status');
      return response.data;
    } catch (error) {
      logger.warn('Error fetching sensor profiles status:', error);
      return {
        initialized: false,
        global_profiles: 0,
        tenant_profiles: 0,
        total: 0
      };
    }
  }

  /**
   * @deprecated Use createSensor instead, which now uses the SDM service.
   */
  async registerSensor(sensorData: {
    external_id: string;
    name: string;
    profile: string;
    location: { lat: number; lon: number };
    station_id?: string;
    is_under_canopy?: boolean;
    metadata?: Record<string, any>;
  }): Promise<any> {
    logger.warn('[API] registerSensor is deprecated. Use createSensor instead.');
    const response = await this.client.post('/api/sensors/register', sensorData);
    return response.data;
  }

  // =============================================================================
  // Telemetry Methods
  // =============================================================================

  async getDeviceTelemetry(deviceId: string, params?: {
    start_time?: string;
    end_time?: string;
    limit?: number;
  }): Promise<any> {
    const response = await this.client.get(`/api/devices/${deviceId}/telemetry`, { params });
    return response.data;
  }

  async getDeviceLatestTelemetry(deviceId: string): Promise<any> {
    const response = await this.client.get(`/api/devices/${deviceId}/telemetry/latest`);
    return response.data;
  }

  async getDeviceTelemetryStats(deviceId: string, params?: {
    start_time?: string;
    end_time?: string;
  }): Promise<any> {
    const response = await this.client.get(`/api/devices/${deviceId}/telemetry/stats`, { params });
    return response.data;
  }

  // =============================================================================
  // Timeseries Reader Service Methods
  // =============================================================================

  /**
   * Get historical timeseries data for an entity from TimescaleDB
   */
  async getTimeseriesData(
    entityId: string,
    options: {
      start_time: string;
      end_time?: string;
      aggregation?: 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly';
      attribute?: string;
      limit?: number;
    }
  ): Promise<{
    entity_id: string;
    start_time: string;
    end_time: string;
    aggregation: string;
    count: number;
    data: Array<{
      timestamp: string;
      [attribute: string]: string | number;
    }>;
  }> {
    // Use timeseries-reader service (assumes it's proxied via api-gateway or direct)
    // TODO: Configure base URL for timeseries-reader service
    const response = await this.client.get(`/api/timeseries/entities/${entityId}/data`, {
      params: options,
    });
    return response.data;
  }

  /**
   * Get statistics for entity timeseries data
   */
  async getTimeseriesStats(
    entityId: string,
    options: {
      start_time: string;
      end_time?: string;
      attribute?: string;
    }
  ): Promise<{
    entity_id: string;
    start_time: string;
    end_time: string;
    stats: Record<string, {
      min: number | null;
      max: number | null;
      avg: number | null;
      count: number;
      first_observed: string | null;
      last_observed: string | null;
    }>;
  }> {
    const response = await this.client.get(`/api/timeseries/entities/${entityId}/stats`, {
      params: options,
    });
    return response.data;
  }

  // =============================================================================
  // NGSI-LD Subscriptions Methods
  // =============================================================================

  /**
   * Get all subscriptions
   */
  async getSubscriptions(params?: {
    type?: string;
    id?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    try {
      const response = await this.client.get('/ngsi-ld/v1/subscriptions', { params });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      // If endpoint doesn't exist, return empty array (graceful degradation)
      if (error.response?.status === 404) {
        logger.warn('[API] Subscriptions endpoint not available');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    const response = await this.client.get(`/ngsi-ld/v1/subscriptions/${subscriptionId}`);
    return response.data;
  }

  /**
   * Create a new subscription
   */
  async createSubscription(subscription: any): Promise<any> {
    const response = await this.client.post('/ngsi-ld/v1/subscriptions', subscription, {
      headers: {
        'Content-Type': 'application/json',
        'Link': '<https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.6.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
      },
    });
    return response.data;
  }

  /**
   * Update a subscription
   */
  async updateSubscription(subscriptionId: string, updates: any): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/subscriptions/${subscriptionId}`, updates, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.client.delete(`/ngsi-ld/v1/subscriptions/${subscriptionId}`);
  }

  // =============================================================================
  // Device Commands Methods
  // =============================================================================

  async sendDeviceCommand(deviceId: string, command: {
    command_type: string;
    payload: Record<string, any>;
  }): Promise<any> {
    const response = await this.client.post(`/api/devices/${deviceId}/commands`, command);
    return response.data;
  }

  async getDeviceCommands(deviceId: string, params?: {
    limit?: number;
    status?: string;
  }): Promise<any> {
    const response = await this.client.get(`/api/devices/${deviceId}/commands`, { params });
    return response.data;
  }

  // =============================================================================
  // SDM Integration Methods
  // =============================================================================
  // Note: getSDMEntities, getSDMEntitySchema, and createSDMEntity are defined later
  // to avoid duplication. See lines 1066-1094 for implementations.

  async getSDMEntityInstances(entityType: string, useCache: boolean = true): Promise<any[]> {
    const cacheKey = `entities:${entityType}`;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get<unknown[]>(cacheKey);
      if (cached) {
        return cached as any[];
      }
    }

    try {
      const response = await retryRequest(
        () => this.client.get(`/sdm/entities/${entityType}/instances`),
        3,
        1000
      );

      const data = response.data.instances || [];

      // Cache for 60 seconds
      if (useCache) {
        this.cache.set(cacheKey, data, 60000);
      }

      return data;
    } catch (error: any) {
      // Clear cache on error
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  async getSDMEntityInstancesPaginated(entityType: string, params?: { limit?: number; offset?: number }): Promise<{ instances: any[]; total: number; count: number }> {
    const response = await this.client.get(`/sdm/entities/${entityType}/instances`, { params });
    return response.data;
  }

  async updateSDMEntity(entityType: string, entityId: string, updates: any): Promise<void> {
    await this.client.patch(`/sdm/entities/${entityType}/instances/${entityId}`, updates);
  }

  async getSDMEntityInstance(entityType: string, entityId: string): Promise<any> {
    const response = await this.client.get(`/sdm/entities/${entityType}/instances/${entityId}`);
    return response.data.entity || response.data;
  }

  async deleteSDMEntity(entityType: string, entityId: string): Promise<void> {
    await this.client.delete(`/sdm/entities/${entityType}/instances/${entityId}`);
  }

  async migrateToSDM(entityIds: string[]): Promise<any> {
    const response = await this.client.post('/sdm/migrate', { entityIds });
    return response.data;
  }

  // =============================================================================
  // Vercel Blob Upload Authorization
  // =============================================================================

  async authorizeBlobUpload(data: {
    filename: string;
    contentType?: string;
    fileSize?: number;
  }): Promise<{ token: string; filename: string; contentType: string }> {
    const response = await this.client.post('/entity-manager/api/upload/authorize', data);
    return response.data;
  }

  // =============================================================================
  // Asset Service (MinIO) - Replaces Vercel Blob
  // =============================================================================

  /**
   * Upload an asset (3D model or icon) to MinIO
   */
  async uploadAsset(
    formData: FormData,
    config?: { onUploadProgress?: (progressEvent: any) => void }
  ): Promise<{
    url: string;
    asset_id: string;
    key: string;
    size: number;
    content_type: string;
    tenant_id: string;
  }> {
    const response = await this.client.post('/api/assets/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: config?.onUploadProgress,
    });
    return response.data;
  }

  /**
   * Get a presigned URL for an asset
   */
  async getAssetUrl(
    assetId: string,
    assetType: 'model' | 'icon',
    extension?: string
  ): Promise<{ url: string; expires_in: number; asset_id: string }> {
    const params = new URLSearchParams({ type: assetType });
    if (extension) params.append('extension', extension);
    const response = await this.client.get(`/api/assets/${assetId}?${params}`);
    return response.data;
  }

  /**
   * Delete an asset from MinIO
   */
  async deleteAsset(
    assetId: string,
    assetType: 'model' | 'icon',
    extension?: string
  ): Promise<{ deleted: boolean; asset_id: string }> {
    const params = new URLSearchParams({ type: assetType });
    if (extension) params.append('extension', extension);
    const response = await this.client.delete(`/api/assets/${assetId}?${params}`);
    return response.data;
  }

  // =============================================================================
  // Heartbeat / Connection Status
  // =============================================================================

  /**
   * Check if an entity (sensor, robot, device) has connected/sent data
   */
  async checkEntityHeartbeat(
    entityId: string,
    entityType: 'sensor' | 'robot' | 'device'
  ): Promise<{ connected: boolean; last_seen?: string; first_seen?: string }> {
    try {
      const response = await this.client.get('/api/heartbeat/check', {
        params: { entity_id: entityId, entity_type: entityType }
      });
      return response.data;
    } catch (error) {
      // If endpoint doesn't exist yet, return not connected
      return { connected: false };
    }
  }

  // =============================================================================
  // Enhanced Entity Methods using SDM
  // =============================================================================

  async getRobotsSDM(): Promise<Robot[]> {
    const instances = await this.getSDMEntityInstances('AgriculturalRobot');
    return instances.map(this.mapSDMToRobot);
  }

  async getSensorsSDM(): Promise<Sensor[]> {
    const instances = await this.getSDMEntityInstances('AgriSensor');
    return instances.map(this.mapSDMToSensor);
  }

  async getParcelsSDM(): Promise<Parcel[]> {
    const instances = await this.getSDMEntityInstances('AgriParcel');
    return instances.map(this.mapSDMToParcel);
  }

  async createRobotSDM(robotData: Partial<Robot>): Promise<Robot> {
    const sdmData = this.mapRobotToSDM(robotData);
    const result = await this.createSDMEntity('AgriculturalRobot', sdmData);
    return this.mapSDMToRobot(result.entity);
  }

  async updateRobotSDM(id: string, updates: Partial<Robot>): Promise<void> {
    const sdmUpdates = this.mapRobotToSDM(updates);
    await this.updateSDMEntity('AgriculturalRobot', id, sdmUpdates);
  }

  async deleteRobotSDM(id: string): Promise<void> {
    await this.deleteSDMEntity('AgriculturalRobot', id);
  }

  // =============================================================================
  // SDM Mapping Methods
  // =============================================================================

  private mapSDMToRobot(sdmEntity: any): Robot {
    return {
      id: sdmEntity.id,
      type: sdmEntity.type,
      name: sdmEntity.name || { type: 'Property', value: 'Unnamed Robot' },
      status: sdmEntity.status || { type: 'Property', value: 'idle' },
      batteryLevel: sdmEntity.batteryLevel,
      location: sdmEntity.location
    };
  }

  private mapSDMToSensor(sdmEntity: any): Sensor {
    return {
      id: sdmEntity.id,
      type: sdmEntity.type,
      name: sdmEntity.name || { type: 'Property', value: 'Unnamed Sensor' },
      location: sdmEntity.location,
      moisture: sdmEntity.moisture,
      ph: sdmEntity.ph,
      temperature: sdmEntity.temperature
    };
  }

  private mapSDMToParcel(sdmEntity: any): Parcel {
    return {
      id: sdmEntity.id,
      type: sdmEntity.type,
      name: sdmEntity.name || { type: 'Property', value: 'Unnamed Parcel' },
      area: sdmEntity.area,
      cropType: sdmEntity.cropType,
      location: sdmEntity.location
    };
  }

  private mapRobotToSDM(robot: Partial<Robot>): any {
    const sdmData: any = {};

    if (robot.name) sdmData.name = robot.name;
    if (robot.status) sdmData.status = robot.status;
    if (robot.batteryLevel) sdmData.batteryLevel = robot.batteryLevel;
    if (robot.location) sdmData.location = robot.location;

    return sdmData;
  }

  // Note: getSensors() is defined above (line 150) using new API endpoints
  // This duplicate method has been removed to avoid TypeScript errors

  async createSensor(sensor: Partial<Sensor>): Promise<Sensor> {
    // Use SDM service for creating sensors to ensure proper IoT provisioning
    const sdmData: any = {};

    // Map properties to simple values for SDM consumption
    // Handle both property objects ({type: 'Property', value: '...'}) and direct values
    if (sensor.name) {
      sdmData.name = typeof sensor.name === 'object' && 'value' in sensor.name
        ? sensor.name.value
        : sensor.name;
    }

    // Pass other fields
    if (sensor.location) sdmData.location = sensor.location;
    if (sensor.external_id) sdmData.external_id = sensor.external_id;
    if (sensor.profile) sdmData.profile = sensor.profile;

    // SDM service handles the rest (NGSI-LD formatting, IoT keys, etc.)
    const result = await this.createSDMEntity('AgriSensor', sdmData);

    // Return mapped entity using existing helper
    return this.mapSDMToSensor(result.entity || result);
  }

  async updateSensor(id: string, updates: Partial<Sensor>): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, updates, {
      headers: { 'Content-Type': 'application/ld+json' },
    });
  }

  async deleteSensor(id: string): Promise<void> {
    try {
      // Try new API endpoint first
      await this.client.delete(`/api/sensors/${id}`);
    } catch (error) {
      // Fallback to NGSI-LD endpoint
      await this.client.delete(`/ngsi-ld/v1/entities/${id}`);
    }
  }

  async regenerateIoTKey(id: string): Promise<any> {
    const response = await this.client.post(`/sdm/entities/${id}/iot/regenerate-key`);
    return response.data;
  }

  async getIoTDetails(id: string): Promise<any> {
    const response = await this.client.get(`/sdm/entities/${id}/iot/details`);
    return response.data;
  }

  // Entities - Parcels
  async getMachines(): Promise<AgriculturalMachine[]> {
    try {
      // Query for AgriculturalRobot, AgriculturalTractor, and AgriculturalMachine
      const [robotsRes, tractorsRes, machinesRes] = await Promise.all([
        this.client.get('/ngsi-ld/v1/entities', {
          params: { type: 'AgriculturalRobot', options: 'keyValues' },
          headers: { 'Accept': 'application/ld+json' }
        }).catch(() => ({ data: [] })),
        this.client.get('/ngsi-ld/v1/entities', {
          params: { type: 'AgriculturalTractor', options: 'keyValues' },
          headers: { 'Accept': 'application/ld+json' }
        }).catch(() => ({ data: [] })),
        this.client.get('/ngsi-ld/v1/entities', {
          params: { type: 'AgriculturalMachine', options: 'keyValues' },
          headers: { 'Accept': 'application/ld+json' }
        }).catch(() => ({ data: [] }))
      ]);

      const robots = Array.isArray(robotsRes.data) ? robotsRes.data : [];
      const tractors = Array.isArray(tractorsRes.data) ? tractorsRes.data : [];
      const machines = Array.isArray(machinesRes.data) ? machinesRes.data : [];

      return [...robots, ...tractors, ...machines].map((m: any) => {
        // Determine type description based on entity type
        let typeDesc = 'Machinery';
        if (m.type === 'AgriculturalRobot') typeDesc = 'Autonomous Robot';
        else if (m.type === 'AgriculturalTractor') typeDesc = 'Tractor';

        return {
          id: m.id,
          name: m.name || 'Unnamed Machine',
          type: typeDesc,
          status: m.status || 'offline',
          location: m.location, // options=keyValues returns direct GeoJSON
          batteryLevel: m.batteryLevel || 100,
          task: m.currentTask || 'Idle',
          operationType: m.operationType,
          model3d: m.model3d
        };
      });
    } catch (error) {
      logger.warn('Error fetching machines:', error);
      return [];
    }
  }

  async getLivestock(): Promise<LivestockAnimal[]> {
    try {
      const response = await this.client.get('/ngsi-ld/v1/entities', {
        params: { type: 'LivestockAnimal', options: 'keyValues' },
        headers: { 'Accept': 'application/ld+json' },
      });

      const payload = Array.isArray(response.data) ? response.data : [];

      return payload.map((l: any) => ({
        id: l.id,
        type: 'LivestockAnimal',
        name: l.name || 'Unnamed Animal',
        species: l.species || 'Unknown',
        status: l.status || 'healthy',
        location: l.location, // options=keyValues returns direct GeoJSON
        lastUpdate: l.modifiedAt || new Date().toISOString()
      }));
    } catch (error) {
      logger.warn('Error fetching livestock:', error);
      return [];
    }
  }

  async getWeatherStations(): Promise<WeatherStation[]> {
    try {
      const response = await this.client.get('/ngsi-ld/v1/entities', {
        params: { type: 'WeatherObserved' },
        headers: { 'Accept': 'application/ld+json' },
      });
      // Map NGSI-LD response
      const payload = Array.isArray(response.data) ? response.data : [];

      return payload.map((w: any) => ({
        id: w.id,
        type: 'WeatherStation',
        name: w.name || 'Weather Station',
        location: w.location, // options=keyValues returns direct GeoJSON
        readings: {
          temperature: w.temperature || 0,
          humidity: w.humidity || 0,
          pressure: w.pressure || 1013,
          windSpeed: w.windSpeed || 0
        },
        lastUpdate: w.modifiedAt || new Date().toISOString()
      }));
    } catch (error) {
      logger.warn('Error fetching weather stations:', error);
      return [];
    }
  }

  async getParcels(): Promise<Parcel[]> {
    try {
      const response = await this.client.get('/ngsi-ld/v1/entities', {
        params: { type: 'AgriParcel' },
        headers: { 'Accept': 'application/ld+json' },
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('Error fetching parcels:', error);
      return [];
    }
  }

  async getTenantLimits(): Promise<TenantLimits> {
    const response = await this.client.get('/admin/tenant-limits');
    return response.data;
  }

  async getTenantUsage(): Promise<TenantUsageSummary> {
    const response = await this.client.get('/admin/tenant-usage');
    return response.data;
  }

  async getGrafanaLink(params?: { dashboard?: string }): Promise<GrafanaLink> {
    const response = await this.client.get('/entity-manager/integrations/grafana/link', {
      params,
    });
    return response.data;
  }

  async createParcel(parcel: Partial<Parcel>): Promise<Parcel> {
    const response = await this.client.post('/ngsi-ld/v1/entities', parcel, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
      },
    });
    return response.data;
  }

  async updateParcel(id: string, updates: Partial<Parcel>): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, updates, {
      headers: { 'Content-Type': 'application/ld+json' },
    });
  }

  async deleteParcel(id: string): Promise<void> {
    await this.client.delete(`/ngsi-ld/v1/entities/${id}`);
  }

  // =============================================================================
  // Agricultural Machines (AgriculturalTractor/AgriOperation)
  // =============================================================================

  async createMachine(machine: Partial<AgriculturalMachine>): Promise<AgriculturalMachine> {
    const response = await this.client.post('/ngsi-ld/v1/entities', machine, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
      },
    });
    return response.data;
  }

  async updateMachine(id: string, updates: Partial<AgriculturalMachine>): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, updates, {
      headers: { 'Content-Type': 'application/ld+json' },
    });
  }

  async deleteMachine(id: string): Promise<void> {
    await this.client.delete(`/ngsi-ld/v1/entities/${id}`);
  }

  // =============================================================================
  // Livestock Animals
  // =============================================================================

  async createLivestockAnimal(animal: Partial<LivestockAnimal>): Promise<LivestockAnimal> {
    const response = await this.client.post('/ngsi-ld/v1/entities', animal, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
      },
    });
    return response.data;
  }

  async updateLivestockAnimal(id: string, updates: Partial<LivestockAnimal>): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, updates, {
      headers: { 'Content-Type': 'application/ld+json' },
    });
  }

  async deleteLivestockAnimal(id: string): Promise<void> {
    await this.client.delete(`/ngsi-ld/v1/entities/${id}`);
  }

  // =============================================================================
  // Weather Stations
  // =============================================================================

  async createWeatherStation(station: Partial<WeatherStation>): Promise<WeatherStation> {
    const response = await this.client.post('/ngsi-ld/v1/entities', station, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
      },
    });
    return response.data;
  }

  async updateWeatherStation(id: string, updates: Partial<WeatherStation>): Promise<void> {
    await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, updates, {
      headers: { 'Content-Type': 'application/ld+json' },
    });
  }

  async deleteWeatherStation(id: string): Promise<void> {
    await this.client.delete(`/ngsi-ld/v1/entities/${id}`);
  }

  // =============================================================================
  // Cadastral API - Parcel Management
  // =============================================================================
  // DEPRECATED: Use parcelApi.ts instead for all parcel operations
  // Legacy methods removed - parcelApi.ts provides Orion-LD First architecture

  // =============================================================================
  // NDVI Jobs & Results
  // =============================================================================

  async createNdviJob(payload: {
    parcelId?: string | null;
    geometry?: GeoPolygon | null;
    timeRange?: { start?: string; end?: string };
    resolution?: number;
    satellite?: string;
    maxCloudCoverage?: number;
    indexType?: string;
  }): Promise<NDVIJob> {
    try {
      logger.debug('[API] Creating NDVI job with payload:', payload);
      const response = await this.client.post('/api/ndvi/jobs', {
        parcelId: payload.parcelId,
        geometry: payload.geometry || undefined,
        timeRange: payload.timeRange,
        resolution: payload.resolution,
        satellite: payload.satellite,
        maxCloudCoverage: payload.maxCloudCoverage,
        indexType: payload.indexType,
      });
      logger.debug('[API] NDVI job response:', response.status, response.data);
      logger.debug('[API] Response data type:', typeof response.data);
      logger.debug('[API] Response data keys:', response.data ? Object.keys(response.data) : 'null/undefined');
      // Backend returns {job: {...}}, extract the job object
      const job = (response.data as any)?.job || response.data;
      logger.debug('[API] Extracted job:', job);
      if (!job) {
        logger.error('[API] No job found in response! Response data:', response.data);
        throw new Error('Invalid response format: job not found in response');
      }
      return job;
    } catch (error: any) {
      logger.error('[API] Error creating NDVI job:', error);
      logger.error('[API] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config,
      });
      throw error;
    }
  }

  async getNdviJobs(): Promise<NDVIJob[]> {
    const response = await this.client.get('/api/ndvi/jobs');
    logger.debug('[API] getNdviJobs RAW response.data type:', typeof response.data, 'isArray:', Array.isArray(response.data));

    // CRITICAL FIX: response.data is coming as a string JSON, not parsed object
    // Parse it first, then extract jobs array
    let data = response.data;

    // If it's a string, parse it
    if (typeof data === 'string') {
      logger.debug('[API] getNdviJobs: response.data is string, parsing JSON...');
      logger.debug('[API] getNdviJobs: String length:', data.length, 'first 200 chars:', data.substring(0, 200));
      logger.debug('[API] getNdviJobs: Last 200 chars:', data.substring(Math.max(0, data.length - 200)));
      try {
        logger.debug('[API] getNdviJobs: About to call JSON.parse...');
        const startTime = performance.now();
        let parsedData;
        try {
          parsedData = JSON.parse(data);
          const parseTime = performance.now() - startTime;
          logger.debug('[API] getNdviJobs: ✅ JSON.parse completed in', parseTime.toFixed(2), 'ms');
          data = parsedData;
        } catch (parseError: any) {
          const parseTime = performance.now() - startTime;
          logger.error('[API] getNdviJobs: ❌ JSON.parse threw error after', parseTime.toFixed(2), 'ms');
          throw parseError;
        }
        logger.debug('[API] getNdviJobs: ✅ Parsed successfully, type:', typeof data, 'isArray:', Array.isArray(data), 'has jobs:', !!data?.jobs);

        if (data && typeof data === 'object') {
          const keys = Object.keys(data);
          logger.debug('[API] getNdviJobs: Parsed data keys:', keys);

          if (data.jobs) {
            logger.debug('[API] getNdviJobs: data.jobs type:', typeof data.jobs, 'isArray:', Array.isArray(data.jobs), 'length:', data.jobs?.length);
            if (Array.isArray(data.jobs) && data.jobs.length > 0) {
              logger.debug('[API] getNdviJobs: First job ID:', data.jobs[0]?.id);
            }
          } else {
            logger.warn('[API] getNdviJobs: data.jobs is missing! Available keys:', keys);
          }
        }
      } catch (e: any) {
        logger.error('[API] ❌ Failed to parse response.data:', e);
        logger.error('[API] Parse error type:', typeof e, 'name:', e?.name, 'message:', e?.message);
        logger.error('[API] Parse error details:', {
          message: e?.message,
          name: e?.name,
          stack: e?.stack?.substring(0, 500)
        });
        // Try to find where the JSON is malformed
        // Firefox uses "column X", Chrome uses "position X"
        let pos = -1;
        if (e?.message?.includes('column')) {
          const match = e.message.match(/column (\d+)/);
          if (match) {
            pos = parseInt(match[1]) - 1; // column is 1-based, substring is 0-based
          }
        } else if (e?.message?.includes('position')) {
          const match = e.message.match(/position (\d+)/);
          if (match) {
            pos = parseInt(match[1]);
          }
        }

        if (pos >= 0 && pos < data.length) {
          logger.error('[API] JSON error at position/column', pos);
          logger.error('[API] Character at error position:', JSON.stringify(data[pos]), 'charCode:', data.charCodeAt(pos));
          logger.error('[API] Context before error (100 chars):', data.substring(Math.max(0, pos - 100), pos));
          logger.error('[API] Context at error (50 chars):', data.substring(pos, Math.min(data.length, pos + 50)));
          logger.error('[API] Context after error (100 chars):', data.substring(Math.min(data.length, pos + 1), Math.min(data.length, pos + 101)));

          // Try to find the problematic character
          const problematicChar = data[pos];
          logger.error('[API] Problematic character:', problematicChar, 'charCode:', problematicChar?.charCodeAt?.(0));
        }
        logger.error('[API] ❌ Returning empty array due to parse error');
        return [];
      }
    }

    // Handle both formats: direct array or {jobs: [...]}
    logger.debug('[API] getNdviJobs: Checking data format - isArray:', Array.isArray(data), 'isObject:', data && typeof data === 'object', 'has jobs prop:', !!(data && typeof data === 'object' && data.jobs));

    if (Array.isArray(data)) {
      logger.debug('[API] getNdviJobs: ✅ Returning array with', data.length, 'jobs');
      logger.debug('[API] getNdviJobs: First job in array:', data[0]?.id || 'N/A');
      return data;
    } else if (data && typeof data === 'object' && data.jobs && Array.isArray(data.jobs)) {
      logger.debug('[API] getNdviJobs: ✅ Extracting jobs array from object, length:', data.jobs.length);
      logger.debug('[API] getNdviJobs: First job ID:', data.jobs[0]?.id || 'N/A');
      logger.debug('[API] getNdviJobs: ✅ Returning', data.jobs.length, 'jobs');
      const jobsArray = data.jobs;
      logger.debug('[API] getNdviJobs: ✅ Final return - jobsArray type:', typeof jobsArray, 'isArray:', Array.isArray(jobsArray), 'length:', jobsArray?.length);
      return jobsArray;
    }

    logger.warn('[API] getNdviJobs: ❌ Unexpected data format:', typeof data);
    logger.warn('[API] getNdviJobs: Data structure:', {
      isArray: Array.isArray(data),
      isObject: data && typeof data === 'object',
      hasJobs: !!(data && typeof data === 'object' && data.jobs),
      keys: data && typeof data === 'object' ? Object.keys(data) : 'N/A',
      dataType: typeof data,
      dataPreview: data && typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data).substring(0, 200)
    });
    logger.warn('[API] getNdviJobs: ❌ Returning empty array');
    return [];
  }

  async getNdviJob(jobId: string): Promise<NDVIJob | null> {
    const response = await this.client.get(`/api/ndvi/jobs/${jobId}`);
    return response.data || null;
  }

  async deleteNdviJob(jobId: string, deleteResults: boolean = false): Promise<any> {
    const params = deleteResults ? { delete_results: 'true' } : {};
    const response = await this.client.delete(`/api/ndvi/jobs/${jobId}`, { params });
    return response.data;
  }

  async deleteNdviResult(resultId: string): Promise<any> {
    const response = await this.client.delete(`/api/ndvi/results/${resultId}`);
    return response.data;
  }

  async cleanupNdviJobs(
    statuses: string[] = ['failed', 'queued'],
    olderThanDays?: number,
    deleteResults: boolean = false
  ): Promise<any> {
    const params: any = {
      status: statuses.join(','),
      delete_results: deleteResults.toString(),
    };
    if (olderThanDays) {
      params.older_than_days = olderThanDays.toString();
    }
    const response = await this.client.post('/api/ndvi/jobs/cleanup', null, { params });
    return response.data;
  }

  // =============================================================================
  // Terrain 3D Service - REMOVED
  // =============================================================================
  // El sistema antiguo de generación de terrain bajo demanda ha sido eliminado.
  // Ahora usamos providers externos (IGN/IDENA) directamente en CesiumMap.
  // =============================================================================

  // =============================================================================
  // Asset Digitization Service
  // =============================================================================

  async createAsset(asset: AssetCreationPayload): Promise<any> {
    const response = await this.client.post('/entity-manager/api/assets', asset);
    return response.data;
  }

  async getNdviResults(params?: { parcelId?: string; limit?: number }): Promise<NDVIResult[]> {
    try {
      logger.debug('[API] getNdviResults called with params:', params);
      const response = await this.client.get('/api/ndvi/results', {
        params: {
          parcel_id: params?.parcelId,
          limit: params?.limit,
        },
      });
      logger.debug('[API] getNdviResults response:', response.status, response.data);
      logger.debug('[API] getNdviResults response.data type:', typeof response.data, 'isArray:', Array.isArray(response.data));

      // Handle both formats: direct array or {results: [...]}
      let data = response.data;
      if (data && typeof data === 'object' && !Array.isArray(data) && data.results && Array.isArray(data.results)) {
        logger.debug('[API] getNdviResults: Extracting results array from object');
        data = data.results;
      }

      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      logger.error('[API] getNdviResults error:', error);
      logger.error('[API] getNdviResults error response:', error.response?.data);
      logger.error('[API] getNdviResults error status:', error.response?.status);
      return [];
    }
  }

  // Terms and Conditions
  async getTerms(language: string): Promise<{ content: string; last_updated: string; language: string }> {
    const response = await this.client.get(`/api/admin/terms/${language}`);
    return response.data;
  }

  async saveTerms(language: string, content: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post(`/api/admin/terms/${language}`, {
      content,
      language,
    });
    return response.data;
  }

  // =============================================================================
  // Weather Data Methods
  // =============================================================================

  async getWeatherLocations(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/weather/locations');
      return response.data?.locations || [];
    } catch (error) {
      logger.warn('Error fetching weather locations:', error);
      return [];
    }
  }

  async createWeatherLocation(location: {
    municipality_code: string;
    is_primary?: boolean;
    label?: string;
    station_id?: string;
    metadata?: any;
  }): Promise<any> {
    try {
      const response = await this.client.post('/api/weather/locations', location);
      return response.data?.location;
    } catch (error) {
      logger.warn('Error creating weather location:', error);
      throw error;
    }
  }

  async searchMunicipalities(query: string, limit: number = 20): Promise<{ municipalities: any[]; count: number }> {
    try {
      const url = '/api/weather/municipalities/search';
      const fullUrl = `${this.client.defaults.baseURL || ''}${url}`;
      logger.debug('[API] Searching municipalities:', { query, limit, url, fullUrl });
      const response = await this.client.get(url, {
        params: { q: query, limit },
      });
      logger.debug('[API] Municipalities search successful:', response.data);
      return {
        municipalities: response.data?.municipalities || [],
        count: response.data?.count || 0,
      };
    } catch (error: any) {
      logger.error('[API] Error searching municipalities:', error);
      logger.error('[API] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        headers: error.config?.headers,
      });
      // Don't silently return empty - let the error propagate so UI can show it
      throw error;
    }
  }

  async getNearestMunicipality(latitude: number, longitude: number, maxDistanceKm: number = 50): Promise<any> {
    try {
      const response = await this.client.get('/api/weather/municipality/near', {
        params: { latitude, longitude, max_distance_km: maxDistanceKm },
      });
      return response.data;
    } catch (error: any) {
      logger.error('[API] Error getting nearest municipality:', error);
      throw error;
    }
  }

  async getLatestWeatherObservations(params?: {
    municipality_code?: string;
    source?: string;
    data_type?: string;
  }): Promise<any[]> {
    try {
      const response = await this.client.get('/api/weather/observations/latest', { params });
      return response.data?.observations || [];
    } catch (error) {
      logger.warn('Error fetching latest weather observations:', error);
      return [];
    }
  }

  async getWeatherObservations(params?: {
    municipality_code?: string;
    source?: string;
    data_type?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<{ observations: any[]; count: number }> {
    try {
      const response = await this.client.get('/api/weather/observations', { params });
      return {
        observations: response.data?.observations || [],
        count: response.data?.count || 0,
      };
    } catch (error) {
      logger.warn('Error fetching weather observations:', error);
      return { observations: [], count: 0 };
    }
  }

  async getParcelAgroStatus(parcelId: string): Promise<{
    semaphores: {
      spraying: 'optimal' | 'caution' | 'not_suitable' | 'unknown';
      workability: 'optimal' | 'too_wet' | 'too_dry' | 'caution' | 'unknown';
      irrigation: 'satisfied' | 'alert' | 'deficit' | 'unknown';
    };
    source_confidence: 'SENSOR_REAL' | 'OPEN-METEO';
    metrics?: {
      temperature?: number;
      humidity?: number;
      delta_t?: number;
      water_balance?: number;
    };
    timestamp?: string;
  }> {
    try {
      // Use new entity-manager endpoint
      const response = await this.client.get(`/api/weather/parcel/${parcelId}/agro-status`);
      // Transform response to expected format
      return {
        semaphores: response.data.semaphores || {
          spraying: 'unknown',
          workability: 'unknown',
          irrigation: 'unknown'
        },
        source_confidence: response.data.source_confidence || 'OPEN-METEO',
        metrics: response.data.metrics,
        timestamp: response.data.timestamp
      };
    } catch (error) {
      // Fallback to old endpoint if new one fails
      logger.warn('Error with new agro-status endpoint, trying fallback:', error);
      try {
        const response = await this.client.get(`/sensor-ingestor/api/weather/parcel/${parcelId}/status`);
        return response.data;
      } catch (fallbackError) {
        logger.error('Both agro-status endpoints failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  async getWeatherAlerts(params?: {
    municipality_code?: string;
    alert_type?: string;
    active_only?: boolean;
  }): Promise<{ alerts: any[]; count: number }> {
    try {
      const response = await this.client.get('/api/weather/alerts', { params });
      return {
        alerts: response.data?.alerts || [],
        count: response.data?.count || 0,
      };
    } catch (error) {
      logger.warn('Error fetching weather alerts:', error);
      return { alerts: [], count: 0 };
    }
  }

  // =============================================================================
  // Risk Management Methods
  // =============================================================================

  async getEntityInventory(): Promise<EntityInventory[]> {
    try {
      const response = await this.client.get('/entity-manager/api/entities/inventory');
      return response.data?.inventory || [];
    } catch (error) {
      logger.warn('Error fetching entity inventory:', error);
      return [];
    }
  }

  async getRiskCatalog(): Promise<RiskCatalog[]> {
    try {
      const response = await this.client.get('/api/risks/catalog');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('Error fetching risk catalog:', error);
      return [];
    }
  }

  async getRiskSubscriptions(): Promise<RiskSubscription[]> {
    try {
      const response = await this.client.get('/api/risks/subscriptions');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('Error fetching risk subscriptions:', error);
      return [];
    }
  }

  async createRiskSubscription(subscription: Partial<RiskSubscription>): Promise<RiskSubscription> {
    const response = await this.client.post('/api/risks/subscriptions', subscription);
    return response.data;
  }

  async updateRiskSubscription(id: string, updates: Partial<RiskSubscription>): Promise<RiskSubscription> {
    const response = await this.client.patch(`/api/risks/subscriptions/${id}`, updates);
    return response.data;
  }

  async deleteRiskSubscription(id: string): Promise<void> {
    await this.client.delete(`/api/risks/subscriptions/${id}`);
  }

  async getRiskStates(params?: {
    entityId?: string;
    riskCode?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<RiskState[]> {
    try {
      const response = await this.client.get('/api/risks/states', { params });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('Error fetching risk states:', error);
      return [];
    }
  }

  async getRiskWebhooks(): Promise<RiskWebhook[]> {
    try {
      const response = await this.client.get('/api/risks/webhooks');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('Error fetching risk webhooks:', error);
      return [];
    }
  }

  async createRiskWebhook(data: {
    name: string;
    url: string;
    secret?: string;
    min_severity?: string;
  }): Promise<RiskWebhook> {
    const response = await this.client.post('/api/risks/webhooks', data);
    return response.data;
  }

  async deleteRiskWebhook(id: string): Promise<void> {
    await this.client.delete(`/api/risks/webhooks/${id}`);
  }

  async triggerRiskEvaluation(): Promise<{ message: string; tenant_id: string }> {
    const response = await this.client.post('/api/risks/trigger-evaluation');
    return response.data;
  }

  // IoT Provisioning
  async provisionDevice(payload: any): Promise<any> {
    const response = await this.client.post('/iot/provision', payload);
    return response.data;
  }

  // =============================================================================
  // SDM Integration - Entity Types and Management
  // =============================================================================

  async getSDMEntities(): Promise<any> {
    try {
      const response = await this.client.get('/sdm/entities');
      return response.data || {};
    } catch (error) {
      logger.warn('Error fetching SDM entities:', error);
      return {};
    }
  }

  async getSDMEntitySchema(entityType: string): Promise<any> {
    try {
      const response = await this.client.get(`/sdm/entities/${entityType}`);
      return response.data;
    } catch (error) {
      logger.warn(`Error fetching SDM schema for ${entityType}:`, error);
      return null;
    }
  }

  async createSDMEntity(entityType: string, entity: any): Promise<any> {
    const response = await this.client.post(`/sdm/entities/${entityType}/instances`, entity, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
      },
    });
    return response.data;
  }

  async batchCreateEntities(
    entityType: string,
    entities: Array<{ name: string; lat?: number | null; lng?: number | null; [key: string]: any }>
  ): Promise<{ created: number; errors: any[]; entity_ids: string[] }> {
    const response = await this.client.post(`/sdm/entities/${entityType}/batch`, { entities });
    return response.data;
  }

  // =============================================================================
  // Parent Entities (for hierarchy)
  // =============================================================================

  async getParentEntities(entityType?: string): Promise<any[]> {
    try {
      const params = entityType ? { type: entityType } : {};
      const response = await this.client.get('/api/entities/parents', { params });
      return Array.isArray(response.data?.entities) ? response.data.entities : [];
    } catch (error) {
      logger.warn('Error fetching parent entities:', error);
      return [];
    }
  }

  // =============================================================================
  // Robot Provisioning (UUID + ROS namespace; network via nkz-module-vpn Claim Code)
  // =============================================================================

  async provisionRobot(robotData: {
    name: string;
    location: any;
    robotType?: string;
    model?: string;
    manufacturer?: string;
    serialNumber?: string;
    [key: string]: any;
  }): Promise<{
    robot: any;
    credentials: {
      robot_uuid: string;
      ros_namespace: string;
    };
    info?: string;
  }> {
    const response = await this.client.post('/entity-manager/api/robots/provision', robotData);
    return response.data;
  }
}

const apiService = new ApiService();

// Export methods for cache management
export const clearApiCache = () => {
  (apiService as any).cache.clear();
};

export const invalidateEntityCache = (entityType: string, entityId?: string) => {
  const cache = (apiService as any).cache as SimpleCache;
  if (entityId) {
    cache.delete(`entity:${entityType}:${entityId}`);
  }
  cache.delete(`entities:${entityType}`);
};

export const api = apiService;
export default apiService;
