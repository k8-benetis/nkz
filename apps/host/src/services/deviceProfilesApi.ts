/**
 * Device Profiles API Client
 * 
 * CRUD operations for DeviceProfile entities (IoT data mapping).
 * These profiles define how raw sensor data is mapped to SDM attributes.
 */

import { getConfig } from '@/config/environment';

const envConfig = getConfig();
const API_BASE_URL = envConfig.api.baseUrl;

// Helper to get auth headers
const getApiHeaders = (): HeadersInit => {
    const token = sessionStorage.getItem('auth_token') ||
        (typeof window !== 'undefined' && (window as any).keycloak?.token);
    return {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
    };
};

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
    const queryParams = new URLSearchParams();
    if (params?.sdm_entity_type) queryParams.set('sdm_entity_type', params.sdm_entity_type);
    if (params?.include_global !== undefined) queryParams.set('include_global', params.include_global.toString());

    const url = `${API_BASE_URL}/sdm/profiles${queryParams.toString() ? '?' + queryParams : ''}`;

    const response = await fetch(url, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to list device profiles: ${response.statusText}`);
    }

    const data = await response.json();
    return data.profiles;
}

/**
 * Get a single device profile by ID
 */
export async function getDeviceProfile(id: string): Promise<DeviceProfile> {
    const response = await fetch(`${API_BASE_URL}/sdm/profiles/${id}`, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to get device profile: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Create a new device profile
 */
export async function createDeviceProfile(data: CreateDeviceProfileData): Promise<{ id: string; message: string }> {
    const response = await fetch(`${API_BASE_URL}/sdm/profiles`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create device profile');
    }

    return response.json();
}

/**
 * Update an existing device profile
 */
export async function updateDeviceProfile(id: string, data: Partial<CreateDeviceProfileData>): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/sdm/profiles/${id}`, {
        method: 'PUT',
        headers: getApiHeaders(),
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update device profile');
    }
}

/**
 * Delete a device profile
 */
export async function deleteDeviceProfile(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/sdm/profiles/${id}`, {
        method: 'DELETE',
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to delete device profile');
    }
}

/**
 * List all SDM schemas (entity types)
 */
export async function listSDMSchemas(): Promise<SDMSchema[]> {
    const response = await fetch(`${API_BASE_URL}/sdm/profiles/schemas`, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to list SDM schemas: ${response.statusText}`);
    }

    const data = await response.json();
    return data.schemas;
}

/**
 * Get attributes for a specific SDM entity type
 */
export async function getSDMAttributes(entityType: string): Promise<SDMAttribute[]> {
    const response = await fetch(`${API_BASE_URL}/sdm/profiles/schemas/${entityType}/attributes`, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to get SDM attributes: ${response.statusText}`);
    }

    const data = await response.json();
    return data.attributes;
}
