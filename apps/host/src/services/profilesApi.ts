/**
 * Processing Profiles API Client
 *
 * CRUD operations for telemetry processing profiles.
 * Uses the shared ApiService (withCredentials: true) so the httpOnly
 * cookie nkz_token is sent automatically on every request.
 */

import { api } from './api';

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
    const queryParams: Record<string, string> = {};
    if (params?.device_type) queryParams.device_type = params.device_type;
    if (params?.tenant_id) queryParams.tenant_id = params.tenant_id;

    const response = await api.get('/api/v1/profiles', { params: queryParams });
    return response.data.profiles;
}

/**
 * Get telemetry statistics
 */
export async function getTelemetryStats(hours = 24): Promise<TelemetryStats> {
    const response = await api.get('/api/v1/profiles/stats', { params: { hours } });
    return response.data;
}

/**
 * Get unique device types
 */
export async function getDeviceTypes(): Promise<string[]> {
    const response = await api.get('/api/v1/profiles/device-types');
    return response.data.device_types;
}

/**
 * Create a new profile
 */
export async function createProfile(data: CreateProfileData): Promise<{ id: string }> {
    const response = await api.post('/api/v1/profiles', data);
    return response.data;
}

/**
 * Update a profile
 */
export async function updateProfile(id: string, data: UpdateProfileData): Promise<void> {
    await api.put(`/api/v1/profiles/${id}`, data);
}

/**
 * Delete a profile
 */
export async function deleteProfile(id: string): Promise<void> {
    await api.delete(`/api/v1/profiles/${id}`);
}
