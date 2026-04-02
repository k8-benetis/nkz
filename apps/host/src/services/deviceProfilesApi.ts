/**
 * Device Profiles API Client
 *
 * CRUD operations for DeviceProfile entities (IoT data mapping).
 * These profiles define how raw sensor data is mapped to SDM attributes.
 *
 * Uses the shared ApiService (withCredentials: true) so the httpOnly
 * cookie nkz_token is sent automatically on every request.
 */

import { api } from './api';

// =============================================================================
// Types
// =============================================================================

export interface MappingEntry {
    incoming_key: string;
    target_attribute: string;
    type: 'Number' | 'Text' | 'Boolean' | 'DateTime' | 'geo:json';
    transformation?: string;  // JEXL expression, e.g., "val * 0.1"
    unitCode?: string;        // UNECE code, e.g., "CEL"
}

export interface DeviceProfile {
    id: string;
    name: string;
    description?: string;
    sdm_entity_type: string;
    is_public: boolean;
    tenant_id?: string | null;
    mappings: MappingEntry[];
    created_at?: string;
    updated_at?: string;
}

export interface CreateDeviceProfileData {
    name: string;
    description?: string;
    sdm_entity_type: string;
    mappings: MappingEntry[];
    is_public?: boolean;
}

export interface SDMSchema {
    type: string;
    description: string;
    attribute_count: number;
}

export interface SDMAttribute {
    name: string;
    type: string;
    description: string;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * List all device profiles (global + tenant-specific)
 */
export async function listDeviceProfiles(params?: {
    sdm_entity_type?: string;
    include_global?: boolean;
}): Promise<DeviceProfile[]> {
    const queryParams: Record<string, string> = {};
    if (params?.sdm_entity_type) queryParams.sdm_entity_type = params.sdm_entity_type;
    if (params?.include_global !== undefined) queryParams.include_global = params.include_global.toString();

    const response = await api.get('/api/sdm/profiles', { params: queryParams });
    return response.data.profiles;
}

/**
 * Get a single device profile by ID
 */
export async function getDeviceProfile(id: string): Promise<DeviceProfile> {
    const response = await api.get(`/api/sdm/profiles/${id}`);
    return response.data;
}

/**
 * Create a new device profile
 */
export async function createDeviceProfile(data: CreateDeviceProfileData): Promise<{ id: string; message: string }> {
    const response = await api.post('/api/sdm/profiles', data);
    return response.data;
}

/**
 * Update an existing device profile
 */
export async function updateDeviceProfile(id: string, data: Partial<CreateDeviceProfileData>): Promise<void> {
    await api.put(`/api/sdm/profiles/${id}`, data);
}

/**
 * Delete a device profile
 */
export async function deleteDeviceProfile(id: string): Promise<void> {
    await api.delete(`/api/sdm/profiles/${id}`);
}

/**
 * List all SDM schemas (entity types)
 */
export async function listSDMSchemas(): Promise<SDMSchema[]> {
    const response = await api.get('/api/sdm/profiles/schemas');
    return response.data.schemas;
}

/**
 * Get attributes for a specific SDM entity type
 */
export async function getSDMAttributes(entityType: string): Promise<SDMAttribute[]> {
    const response = await api.get(`/api/sdm/profiles/schemas/${entityType}/attributes`);
    return response.data.attributes;
}
