// =============================================================================
// Parcel Helpers - Type Guards and Value Extractors
// =============================================================================
// Helpers to work with Parcel type that supports both NGSI-LD and plain formats

import type { Parcel, GeoPolygon } from '@/types';

function hasValueProperty(field: unknown): field is { value: unknown } {
    return typeof field === 'object' && field !== null && 'value' in field;
}

/**
 * Normalize any value to string (handles both NGSI-LD and plain formats)
 * This is for legacy compatibility with components using old NGSI-LD format
 */
export function normalizeParcelValue(field: unknown): string {
    if (!field) return '';
    // If it's already a string, return it
    if (typeof field === 'string') return field;
    // If it's NGSI-LD format {type: 'Property', value: '...'}, extract value
    if (hasValueProperty(field) && field.value !== undefined) return String(field.value);
    // Fallback
    return '';
}

/**
 * Normalize number value (handles both NGSI-LD and plain formats)
 */
export function normalizeNumberValue(field: unknown): number {
    if (!field) return 0;
    // If it's already a number, return it
    if (typeof field === 'number') return field;
    // If it's NGSI-LD format {type: 'Property', value: 123}, extract value
    if (hasValueProperty(field) && field.value !== undefined) return Number(field.value) || 0;
    // Fallback
    return 0;
}

/**
 * Extract string value from Property or plain string
 */
export function extractStringValue(
    value: string | { type: 'Property'; value: string } | undefined
): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.value || '';
}

/**
 * Extract number value from Property or plain number
 */
export function extractNumberValue(
    value: number | { type: 'Property'; value: number } | undefined
): number {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return value.value || 0;
}

/**
 * Get parcel name (handles both formats)
 */
export function getParcelName(parcel: Parcel): string {
    if (!parcel.name) return parcel.id;
    return normalizeParcelValue(parcel.name);
}

/**
 * Get parcel crop type
 */
export function getParcelCropType(parcel: Parcel): string {
    return normalizeParcelValue(parcel.cropType);
}

/**
 * Get parcel area
 */
export function getParcelArea(parcel: Parcel): number {
    return normalizeNumberValue(parcel.area);
}

/**
 * Get parcel category display name
 */
export function getParcelCategoryDisplay(category?: 'cadastral' | 'managementZone'): string {
    if (!category) return 'Desconocido';
    return category === 'cadastral' ? 'Catastral' : 'Zona';
}

/**
 * Convert Parcel geometry to GeoPolygon format (for CadastralParcel compatibility)
 * Returns undefined if geometry is not a Polygon
 */
export function toGeoPolygon(parcel: Parcel): GeoPolygon | undefined {
    if (!parcel.geometry) return undefined;
    if (parcel.geometry.type !== 'Polygon') return undefined;

    return {
        type: 'Polygon',
        coordinates: parcel.geometry.coordinates as number[][][],
    };
}
