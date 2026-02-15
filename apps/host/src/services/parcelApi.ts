// =============================================================================
// Parcel API Service - Sprint 4
// =============================================================================
// Service for managing AgriParcel entities in Orion-LD
// Implements attribute inheritance for management zones

import axios, { AxiosInstance } from 'axios';
import type { Parcel } from '@/types';
import { getConfig } from '@/config/environment';
import { calculatePolygonAreaHectares } from '@/utils/geo';

const config = getConfig();

// Function to get current token
const getAuthToken = (): string | null => {
    if (typeof window !== 'undefined') {
        const keycloakInstance = (window as any).keycloak;
        if (keycloakInstance && keycloakInstance.token) {
            return keycloakInstance.token;
        }
    }
    return sessionStorage.getItem('auth_token');
};

class ParcelApiService {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: config.api.baseUrl,
            timeout: config.api.timeout,
        });

        // Request interceptor to add auth token
        this.client.interceptors.request.use(
            (requestConfig) => {
                const token = getAuthToken();
                let tenantId = 'nekazari'; // Default fallback

                if (token) {
                    requestConfig.headers.Authorization = `Bearer ${token}`;

                    // Try to extract tenant from token
                    try {
                        const base64Url = token.split('.')[1];
                        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                        const decoded = JSON.parse(jsonPayload);

                        // Check common tenant fields (support both snake_case and kebab-case)
                        tenantId = decoded['tenant-id'] || decoded.tenant_id || decoded.tenantId || decoded.tenant || 'nekazari';
                        console.log('[ParcelAPI] Using Tenant ID:', tenantId);
                    } catch (e) {
                        console.warn('[ParcelAPI] Failed to decode token for tenant extraction', e);
                    }
                }

                // Add Tenant ID header
                requestConfig.headers['X-Tenant-ID'] = tenantId;
                return requestConfig;
            },
            (error) => Promise.reject(error)
        );

        // Response interceptor for error handling and token refresh
        this.client.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                // Handle 401 Unauthorized - try to refresh token
                if (error.response?.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;

                    try {
                        // Try to refresh Keycloak token if available
                        if (typeof window !== 'undefined') {
                            const keycloakInstance = (window as any).keycloak;
                            if (keycloakInstance && typeof keycloakInstance.updateToken === 'function') {
                                const refreshed = await keycloakInstance.updateToken(30); // Refresh if expires in 30s
                                if (refreshed) {
                                    console.log('[ParcelAPI] Token refreshed, retrying request');
                                    // Update token in request
                                    const newToken = keycloakInstance.token;
                                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                                    return this.client(originalRequest);
                                }
                            }
                        }

                        // If refresh failed, redirect to login
                        console.warn('[ParcelAPI] Token refresh failed, redirecting to login');
                        if (typeof window !== 'undefined') {
                            window.location.href = '/login';
                        }
                    } catch (refreshError) {
                        console.error('[ParcelAPI] Error refreshing token:', refreshError);
                        if (typeof window !== 'undefined') {
                            window.location.href = '/login';
                        }
                        return Promise.reject(refreshError);
                    }
                }

                return Promise.reject(error);
            }
        );
    }

    /**
     * Convert frontend Parcel to NGSI-LD AgriParcel entity
     */
    private toNGSILD(parcel: Partial<Parcel>, category: 'cadastral' | 'managementZone' = 'cadastral'): any {
        const entityId = parcel.id || `urn:ngsi-ld:AgriParcel:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Don't include @context in body when using Link header (NGSI-LD best practice)
        const entity: any = {
            id: entityId,
            type: 'AgriParcel',

            category: {
                type: 'Property',
                value: category,
            },
        };

        // Add location (GeoProperty)
        if (parcel.geometry) {
            entity.location = {
                type: 'GeoProperty',
                value: {
                    type: parcel.geometry.type || 'Polygon',
                    coordinates: parcel.geometry.coordinates,
                },
            };
        }

        // Add municipality (only if not empty)
        if (parcel.municipality && parcel.municipality.trim() !== '') {
            entity.municipality = {
                type: 'Property',
                value: parcel.municipality,
            };
        }

        // Add province (only if not empty)
        if (parcel.province && parcel.province.trim() !== '') {
            entity.province = {
                type: 'Property',
                value: parcel.province,
            };
        }

        // Add crop type
        if (parcel.cropType) {
            entity.cropType = {
                type: 'Property',
                value: parcel.cropType,
            };
        }

        // Add name (user-defined name)
        if (parcel.name) {
            entity.name = {
                type: 'Property',
                value: parcel.name,
            };
        }

        // Add cadastral reference (optional)
        if (parcel.cadastralReference) {
            entity.cadastralReference = {
                type: 'Property',
                value: parcel.cadastralReference,
            };
        }

        // Add area (calculated from geometry or provided)
        if (parcel.area !== undefined && parcel.area !== null) {
            entity.area = {
                type: 'Property',
                value: parcel.area,
            };
        }

        // Add parent reference (for management zones)
        if (parcel.refParent) {
            entity.refParent = {
                type: 'Relationship',
                object: parcel.refParent,
            };
        }

        // Add children (for cadastral parcels)
        if (parcel.children && parcel.children.length > 0) {
            entity.children = {
                type: 'Relationship',
                object: parcel.children,
            };
        }

        // Add NDVI enabled flag
        entity.ndviEnabled = {
            type: 'Property',
            value: parcel.ndviEnabled !== undefined ? parcel.ndviEnabled : true,
        };

        // Add notes
        if (parcel.notes) {
            entity.notes = {
                type: 'Property',
                value: parcel.notes,
            };
        }

        // Add refFarm if exists (inherited by children)
        if (parcel.refFarm) {
            entity.refFarm = {
                type: 'Relationship',
                object: parcel.refFarm,
            };
        }

        // Add generation method (for zones)
        if (parcel.generationMethod) {
            entity.generationMethod = {
                type: 'Property',
                value: parcel.generationMethod,
            };
        }

        // Add AI metadata (if AI-generated)
        if (parcel.aiModel) {
            entity.aiModel = {
                type: 'Property',
                value: parcel.aiModel,
            };
        }

        if (parcel.confidence !== undefined) {
            entity.confidence = {
                type: 'Property',
                value: parcel.confidence,
            };
        }

        return entity;
    }

    /**
   * Convert NGSI-LD entity to frontend Parcel (simplified format)
   */
    private fromNGSILD(entity: any): Parcel {
        const geometry = entity.location?.value;
        
        // Calculate area from geometry if not provided
        let area = entity.area?.value;
        if (!area && geometry && geometry.type === 'Polygon' && geometry.coordinates) {
            try {
                area = calculatePolygonAreaHectares(geometry);
            } catch (error) {
                console.warn('Error calculating area from geometry:', error);
            }
        }

        return {
            id: entity.id,
            type: entity.type,
            name: entity.name?.value || null,
            category: entity.category?.value || 'cadastral',
            geometry: geometry,
            municipality: entity.municipality?.value || '',
            province: entity.province?.value || '',
            cropType: entity.cropType?.value || '',
            cadastralReference: entity.cadastralReference?.value,
            refParent: entity.refParent?.object,
            children: entity.children?.object,
            ndviEnabled: entity.ndviEnabled?.value !== false,
            notes: entity.notes?.value,
            refFarm: entity.refFarm?.object,
            area: area,
            generationMethod: entity.generationMethod?.value as 'grid' | 'manual' | 'ai' | undefined,
            aiModel: entity.aiModel?.value,
            confidence: entity.confidence?.value,
        };
    }

    /**
     * Get all parcels for current tenant
     */
    async getParcels(): Promise<Parcel[]> {
        try {
            const response = await this.client.get('/ngsi-ld/v1/entities', {
                params: { type: 'AgriParcel' },
                headers: { 'Accept': 'application/ld+json' },
            });

            const entities = Array.isArray(response.data) ? response.data : [];
            return entities.map(e => this.fromNGSILD(e));
        } catch (error) {
            console.error('Error fetching parcels:', error);
            return [];
        }
    }

    /**
     * Create a new cadastral parcel (parent)
     */
    async createParcel(parcel: Partial<Parcel>): Promise<Parcel> {
        const entity = this.toNGSILD(parcel, 'cadastral');

        const response = await this.client.post('/ngsi-ld/v1/entities', entity, {
            headers: {
                'Content-Type': 'application/ld+json',
                'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
            },
        });

        // Return created entity with ID
        return this.fromNGSILD({ ...entity, id: response.data?.id || entity.id });
    }

    /**
     * Create management zones (children) with attribute inheritance
     * 
     * IMPORTANT: Children inherit from parent:
     * - cropType
     * - refFarm (if exists)
     * - municipality
     * - province
     * - ndviEnabled
     */
    async createZones(parentParcel: Parcel, zones: Partial<Parcel>[]): Promise<Parcel[]> {
        const createdZones: Parcel[] = [];
        const childIds: string[] = [];

        // Create each zone with inherited attributes
        for (const zone of zones) {
            const zoneWithInheritance: Partial<Parcel> = {
                ...zone,
                // Inherit from parent (only if not explicitly set in zone)
                cropType: zone.cropType !== undefined ? zone.cropType : (parentParcel.cropType || ''),
                refFarm: zone.refFarm || parentParcel.refFarm,
                municipality: zone.municipality || parentParcel.municipality,
                province: zone.province || parentParcel.province,
                ndviEnabled: zone.ndviEnabled !== undefined ? zone.ndviEnabled : parentParcel.ndviEnabled,
                // Set parent reference
                refParent: parentParcel.id,
                category: 'managementZone',
                // Set generation method if not provided (default to grid for backward compatibility)
                generationMethod: zone.generationMethod || 'grid',
            };

            const entity = this.toNGSILD(zoneWithInheritance, 'managementZone');

            try {
                const response = await this.client.post('/ngsi-ld/v1/entities', entity, {
                    headers: {
                        'Content-Type': 'application/ld+json',
                        'Link': `<${config.external.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
                    },
                });

                const createdZone = this.fromNGSILD({ ...entity, id: response.data?.id || entity.id });
                createdZones.push(createdZone);
                childIds.push(createdZone.id);
            } catch (error) {
                console.error('Error creating zone:', error);
                throw error;
            }
        }

        // Update parent with children references
        if (childIds.length > 0) {
            try {
                await this.client.patch(
                    `/ngsi-ld/v1/entities/${parentParcel.id}/attrs`,
                    {
                        children: {
                            type: 'Relationship',
                            object: childIds,
                        },
                    },
                    {
                        headers: { 'Content-Type': 'application/ld+json' },
                    }
                );
            } catch (error) {
                console.warn('Error updating parent with children:', error);
                // Non-critical error, zones were created successfully
            }
        }

        return createdZones;
    }

    /**
     * Update an existing parcel
     */
    async updateParcel(id: string, updates: Partial<Parcel>): Promise<void> {
        const attrs: any = {};

        if (updates.name !== undefined) {
            attrs.name = { type: 'Property', value: updates.name };
        }
        if (updates.municipality !== undefined) {
            attrs.municipality = { type: 'Property', value: updates.municipality };
        }
        if (updates.province !== undefined) {
            attrs.province = { type: 'Property', value: updates.province };
        }
        if (updates.cropType !== undefined) {
            attrs.cropType = { type: 'Property', value: updates.cropType };
        }
        if (updates.cadastralReference !== undefined) {
            attrs.cadastralReference = { type: 'Property', value: updates.cadastralReference };
        }
        if (updates.geometry) {
            attrs.location = {
                type: 'GeoProperty',
                value: {
                    type: updates.geometry.type || 'Polygon',
                    coordinates: updates.geometry.coordinates,
                },
            };
        }
        if (updates.notes !== undefined) {
            attrs.notes = { type: 'Property', value: updates.notes };
        }
        if (updates.ndviEnabled !== undefined) {
            attrs.ndviEnabled = { type: 'Property', value: updates.ndviEnabled };
        }
        if (updates.generationMethod !== undefined) {
            attrs.generationMethod = { type: 'Property', value: updates.generationMethod };
        }
        if (updates.aiModel !== undefined) {
            attrs.aiModel = { type: 'Property', value: updates.aiModel };
        }
        if (updates.confidence !== undefined) {
            attrs.confidence = { type: 'Property', value: updates.confidence };
        }

        // Validate zone updates: if updating geometry, ensure it's still within parent
        if (updates.geometry && updates.refParent) {
            // Note: Full validation should be done server-side, but we can add client-side check
            // For now, we'll just allow the update and let server validate
        }

        await this.client.patch(`/ngsi-ld/v1/entities/${id}/attrs`, attrs, {
            headers: { 'Content-Type': 'application/ld+json' },
        });
    }

    /**
     * Delete a parcel
     */
    async deleteParcel(id: string): Promise<void> {
        try {
            // Try without encoding first (most common case)
        await this.client.delete(`/ngsi-ld/v1/entities/${id}`);
        } catch (error: any) {
            // If 404, try with encoding
            if (error.response?.status === 404) {
                const encodedId = encodeURIComponent(id);
                await this.client.delete(`/ngsi-ld/v1/entities/${encodedId}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Delete a management zone and update parent's children list
     */
    async deleteZone(zoneId: string, parentId: string): Promise<void> {
        try {
            // First, get parent to check children
            const parent = await this.getParcel(parentId);
            if (!parent) {
                throw new Error('Parent parcel not found');
            }

            // Delete the zone
            await this.deleteParcel(zoneId);

            // Update parent's children list (remove deleted zone)
            const updatedChildren = (parent.children || []).filter(childId => childId !== zoneId);
            
            if (updatedChildren.length > 0) {
                await this.client.patch(
                    `/ngsi-ld/v1/entities/${parentId}/attrs`,
                    {
                        children: {
                            type: 'Relationship',
                            object: updatedChildren,
                        },
                    },
                    {
                        headers: { 'Content-Type': 'application/ld+json' },
                    }
                );
            } else {
                // Remove children attribute if no children left
                await this.client.patch(
                    `/ngsi-ld/v1/entities/${parentId}/attrs`,
                    {
                        children: {
                            type: 'Relationship',
                            object: null,
                        },
                    },
                    {
                        headers: { 'Content-Type': 'application/ld+json' },
                    }
                );
            }
        } catch (error: any) {
            console.error('Error deleting zone:', error);
            throw error;
        }
    }

    /**
     * Create zones from AI-generated subdivisions
     */
    async createZonesFromAI(
        parentParcel: Parcel,
        zones: Array<{
            geometry: any;
            name?: string;
            aiModel: string;
            confidence: number;
        }>
    ): Promise<Parcel[]> {
        const zoneParcels: Partial<Parcel>[] = zones.map(zone => ({
            category: 'managementZone',
            refParent: parentParcel.id,
            municipality: parentParcel.municipality,
            province: parentParcel.province,
            cropType: parentParcel.cropType,
            geometry: zone.geometry,
            name: zone.name || `Zona AI ${Date.now()}`,
            generationMethod: 'ai',
            aiModel: zone.aiModel,
            confidence: zone.confidence,
        }));

        return this.createZones(parentParcel, zoneParcels);
    }

    /**
     * Get a single parcel by ID
     */
    async getParcel(id: string): Promise<Parcel | null> {
        try {
            const response = await this.client.get(`/ngsi-ld/v1/entities/${id}`, {
                headers: { 'Accept': 'application/ld+json' },
            });

            return this.fromNGSILD(response.data);
        } catch (error) {
            console.error('Error fetching parcel:', error);
            return null;
        }
    }
}

export const parcelApi = new ParcelApiService();
