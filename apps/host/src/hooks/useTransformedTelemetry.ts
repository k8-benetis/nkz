// =============================================================================
// useTransformedTelemetry Hook
// =============================================================================
// Wrapper around useTelemetry that applies DeviceProfile JEXL transformations
// to sensor data, providing both raw and SDM-normalized values.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTelemetry, UseTelemetryOptions, UseTelemetryReturn, TelemetryValue } from './useTelemetry';
import {
    DeviceProfile,
    MappingEntry,
    getDeviceProfile,
    listDeviceProfiles
} from '@/services/deviceProfilesApi';
import {
    transformPayload,
    getTransformedAttributeInfo,
    TransformedAttributeInfo
} from '@/utils/jexlTransform';

// =============================================================================
// Types
// =============================================================================

export interface UseTransformedTelemetryOptions extends UseTelemetryOptions {
    /** Device Profile ID to use for transformations */
    profileId?: string | null;
    /** Entity type for auto-detecting profile */
    entityType?: string;
    /** Skip profile loading (use raw telemetry only) */
    skipTransformation?: boolean;
}

export interface TransformedTelemetryValue extends TelemetryValue {
    /** Transformed payload using DeviceProfile mappings */
    transformedPayload: Record<string, any>;
    /** Detailed attribute info for UI display */
    attributeInfo: TransformedAttributeInfo[];
}

export interface UseTransformedTelemetryReturn extends Omit<UseTelemetryReturn, 'latestTelemetry'> {
    // Enhanced latest telemetry with transformations
    latestTelemetry: TransformedTelemetryValue | null;

    // Profile state
    profile: DeviceProfile | null;
    isLoadingProfile: boolean;
    profileError: string | null;

    // Mapping info
    mappings: MappingEntry[];

    // Get transformed value by SDM attribute name
    getTransformedValue: (sdmAttribute: string) => any;

    // Get original/raw value by original key
    getRawValue: (originalKey: string) => any;
}

// =============================================================================
// Hook
// =============================================================================

export function useTransformedTelemetry(
    options: UseTransformedTelemetryOptions
): UseTransformedTelemetryReturn {
    const {
        profileId,
        entityType,
        skipTransformation = false,
        ...telemetryOptions
    } = options;

    // Base telemetry hook
    const telemetry = useTelemetry(telemetryOptions);

    // Profile state
    const [profile, setProfile] = useState<DeviceProfile | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    // ==========================================================================
    // Load Profile
    // ==========================================================================

    const loadProfile = useCallback(async () => {
        if (skipTransformation) {
            setProfile(null);
            return;
        }

        // If explicit profileId provided, load that
        if (profileId) {
            setIsLoadingProfile(true);
            setProfileError(null);
            try {
                const loadedProfile = await getDeviceProfile(profileId);
                setProfile(loadedProfile);
            } catch (err: any) {
                console.warn('[useTransformedTelemetry] Error loading profile:', err);
                setProfileError(err.message || 'Error loading profile');
                setProfile(null);
            } finally {
                setIsLoadingProfile(false);
            }
            return;
        }

        // If entityType provided, try to find a matching profile
        if (entityType) {
            setIsLoadingProfile(true);
            setProfileError(null);
            try {
                const profiles = await listDeviceProfiles({ sdm_entity_type: entityType });
                // Prefer public/official profiles
                const officialProfile = profiles.find(p => p.is_public);
                const anyProfile = profiles[0];
                setProfile(officialProfile || anyProfile || null);
            } catch (err: any) {
                console.warn('[useTransformedTelemetry] Error finding profile:', err);
                setProfileError(err.message || 'Error finding profile');
                setProfile(null);
            } finally {
                setIsLoadingProfile(false);
            }
            return;
        }

        // No profile to load
        setProfile(null);
    }, [profileId, entityType, skipTransformation]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    // ==========================================================================
    // Transform Latest Telemetry
    // ==========================================================================

    const mappings = useMemo(() => profile?.mappings || [], [profile]);

    const transformedLatest = useMemo((): TransformedTelemetryValue | null => {
        if (!telemetry.latestTelemetry) return null;

        const rawPayload = telemetry.latestTelemetry.payload;
        const transformedPayload = mappings.length > 0
            ? transformPayload(rawPayload, mappings)
            : rawPayload;
        const attributeInfo = mappings.length > 0
            ? getTransformedAttributeInfo(rawPayload, mappings)
            : [];

        return {
            ...telemetry.latestTelemetry,
            transformedPayload,
            attributeInfo
        };
    }, [telemetry.latestTelemetry, mappings]);

    // ==========================================================================
    // Helper Functions
    // ==========================================================================

    const getTransformedValue = useCallback((sdmAttribute: string): any => {
        if (!transformedLatest?.transformedPayload) return null;
        const val = transformedLatest.transformedPayload[sdmAttribute];
        // Handle NGSI-LD format
        if (typeof val === 'object' && val !== null && 'value' in val) {
            return val.value;
        }
        return val ?? null;
    }, [transformedLatest]);

    const getRawValue = useCallback((originalKey: string): any => {
        if (!telemetry.latestTelemetry?.payload) return null;
        return telemetry.latestTelemetry.payload[originalKey] ?? null;
    }, [telemetry.latestTelemetry]);

    // ==========================================================================
    // Return
    // ==========================================================================

    return {
        // Enhanced telemetry
        latestTelemetry: transformedLatest,
        latestTelemetryHistory: telemetry.latestTelemetryHistory,
        historicalTelemetry: telemetry.historicalTelemetry,
        stats: telemetry.stats,

        // Loading states
        isLoadingLatest: telemetry.isLoadingLatest,
        isLoadingHistorical: telemetry.isLoadingHistorical,
        isLoadingStats: telemetry.isLoadingStats,

        // Errors
        error: telemetry.error,

        // Connection
        isConnected: telemetry.isConnected,

        // Actions
        refreshLatest: telemetry.refreshLatest,
        fetchHistorical: telemetry.fetchHistorical,
        fetchStats: telemetry.fetchStats,
        getMeasurementValue: telemetry.getMeasurementValue,
        getMeasurementUnit: telemetry.getMeasurementUnit,

        // Profile state
        profile,
        isLoadingProfile,
        profileError,
        mappings,

        // Transformation helpers
        getTransformedValue,
        getRawValue,
    };
}

export default useTransformedTelemetry;
