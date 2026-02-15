/**
 * Processing Profiles API Client
 * 
 * CRUD operations for telemetry processing profiles.
 */

import { getConfig } from '@/config/environment';

// Get API base URL from config
const envConfig = getConfig();
const API_BASE_URL = envConfig.api.baseUrl;

// Function to get auth headers
const getApiHeaders = (): HeadersInit => {
    const token = sessionStorage.getItem('auth_token') ||
        (typeof window !== 'undefined' && (window as any).keycloak?.token);
    return {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
    };
};

export interface SamplingRateConfig {
    mode: 'throttle' | 'sample' | 'all';
    interval_seconds: number;
}

export interface ProfileConfig {
    sampling_rate?: SamplingRateConfig;
    active_attributes?: string[];
    ignore_attributes?: string[];
    delta_threshold?: Record<string, number>;
}

export interface ProcessingProfile {
    id: string;
    device_type: string;
    device_id: string | null;
    tenant_id: string | null;
    name: string;
    description: string | null;
    config: ProfileConfig;
    priority: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface CreateProfileData {
    device_type: string;
    device_id?: string;
    tenant_id?: string;
    name: string;
    description?: string;
    config: ProfileConfig;
    priority?: number;
    is_active?: boolean;
}

export interface UpdateProfileData {
    name?: string;
    description?: string;
    config?: ProfileConfig;
    priority?: number;
    is_active?: boolean;
}

export interface TelemetryStats {
    total_received: number;
    total_persisted: number;
    storage_savings_percent: number;
    by_device_type: Record<string, { persisted: number }>;
    period_hours: number;
}

/**
 * List all processing profiles
 */
export async function listProfiles(params?: {
    device_type?: string;
    tenant_id?: string;
}): Promise<ProcessingProfile[]> {
    const queryParams = new URLSearchParams();
    if (params?.device_type) queryParams.set('device_type', params.device_type);
    if (params?.tenant_id) queryParams.set('tenant_id', params.tenant_id);

    const url = `${API_BASE_URL}/api/v1/profiles${queryParams.toString() ? '?' + queryParams : ''}`;

    const response = await fetch(url, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to list profiles: ${response.statusText}`);
    }

    const data = await response.json();
    return data.profiles;
}

/**
 * Get telemetry statistics
 */
export async function getTelemetryStats(hours = 24): Promise<TelemetryStats> {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles/stats?hours=${hours}`, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to get stats: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get unique device types
 */
export async function getDeviceTypes(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles/device-types`, {
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to get device types: ${response.statusText}`);
    }

    const data = await response.json();
    return data.device_types;
}

/**
 * Create a new profile
 */
export async function createProfile(data: CreateProfileData): Promise<{ id: string }> {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create profile');
    }

    return response.json();
}

/**
 * Update a profile
 */
export async function updateProfile(id: string, data: UpdateProfileData): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles/${id}`, {
        method: 'PUT',
        headers: getApiHeaders(),
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update profile');
    }
}

/**
 * Delete a profile
 */
export async function deleteProfile(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles/${id}`, {
        method: 'DELETE',
        headers: getApiHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to delete profile');
    }
}
