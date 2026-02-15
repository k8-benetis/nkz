// =============================================================================
// Parcel Details Panel - Shows cadastral information for selected parcel
// =============================================================================

import React, { useState, useEffect } from 'react';
import { MapPin, Ruler, Building2, Calendar, FileText, X, Loader2 } from 'lucide-react';
import { ParcelAgroStatusDetail } from './ParcelAgroStatusDetail';
import type { Parcel } from '@/types';
import api from '@/services/api';

// Helper function to calculate polygon centroid
const calculatePolygonCentroid = (coordinates: number[][][]): { lon: number; lat: number } | null => {
    if (!coordinates || !coordinates[0] || coordinates[0].length === 0) {
        return null;
    }

    const ring = coordinates[0];
    let sumLon = 0;
    let sumLat = 0;
    let count = 0;

    ring.forEach((point: number[]) => {
        if (point && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number') {
            sumLon += point[0];
            sumLat += point[1];
            count++;
        }
    });

    if (count === 0) return null;

    return {
        lon: sumLon / count,
        lat: sumLat / count,
    };
};

interface ParcelDetailsPanelProps {
    parcel: Parcel | null;
    onClose: () => void;
}

interface LocationInfo {
    coordinates?: { lat: number; lon: number };
    elevation?: number; // Elevation in meters
    municipality?: string;
    province?: string;
    autonomousCommunity?: string;
    country: string;
    hasLocation: boolean;
    population?: number; // Population if available
}

export const ParcelDetailsPanel: React.FC<ParcelDetailsPanelProps> = ({
    parcel,
    onClose,
}) => {
    const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
    const [loadingLocation, setLoadingLocation] = useState(false);

    // Extract coordinates and get municipality info
    useEffect(() => {
        if (!parcel) {
            setLocationInfo(null);
            return;
        }

        const extractLocationInfo = async () => {
            setLoadingLocation(true);
            try {
                let coordinates: { lat: number; lon: number } | undefined = undefined;
                let hasLocation = false;

                // Try to extract coordinates from location.value (NGSI-LD format)
                const locationValue = parcel.location?.value;
                if (locationValue) {
                    if (locationValue.type === 'Point' && locationValue.coordinates) {
                        // Point: [lon, lat]
                        const coords = locationValue.coordinates as [number, number];
                        coordinates = { lon: coords[0], lat: coords[1] };
                        hasLocation = true;
                    } else if (locationValue.type === 'Polygon' && locationValue.coordinates) {
                        // Polygon: calculate centroid
                        try {
                            // Polygon coordinates are number[][][] (array of rings, each ring is array of points)
                            const coords = locationValue.coordinates;
                            if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
                                const polygonCoords = coords as unknown as number[][][];
                                const centroid = calculatePolygonCentroid(polygonCoords);
                                if (centroid) {
                                    coordinates = centroid;
                                    hasLocation = true;
                                }
                            }
                        } catch (e) {
                            console.warn('Error calculating polygon centroid:', e);
                        }
                    }
                }

                // Also check geometry (simplified format)
                if (!coordinates && parcel.geometry) {
                    if (parcel.geometry.type === 'Point' && Array.isArray(parcel.geometry.coordinates)) {
                        const coords = parcel.geometry.coordinates as [number, number];
                        coordinates = { lon: coords[0], lat: coords[1] };
                        hasLocation = true;
                    } else if (parcel.geometry.type === 'Polygon' && Array.isArray(parcel.geometry.coordinates)) {
                        // Calculate centroid from polygon
                        try {
                            const coords = parcel.geometry.coordinates;
                            // Verify it's a proper Polygon structure (number[][][])
                            if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
                                const polygonCoords = coords as unknown as number[][][];
                                const centroid = calculatePolygonCentroid(polygonCoords);
                                if (centroid) {
                                    coordinates = centroid;
                                    hasLocation = true;
                                }
                            }
                        } catch (e) {
                            console.warn('Error calculating polygon centroid from geometry:', e);
                        }
                    }
                }

                // Priority 1: If we have coordinates, always recalculate municipality from coordinates
                // This ensures accuracy even if stored municipality is incorrect
                // Only use stored municipality if we don't have coordinates
                if (coordinates) {
                    console.log(`[ParcelDetailsPanel] Calculating municipality from coordinates:`, coordinates.lat, coordinates.lon);
                    try {
                        // Get municipality info and elevation in parallel
                        const [municipalityData, elevation] = await Promise.all([
                            api.getNearestMunicipality(
                                coordinates.lat,
                                coordinates.lon,
                                10 // max 10km - more precise for parcel-specific location
                            ).catch((err) => {
                                console.error('[ParcelDetailsPanel] Error getting nearest municipality:', err);
                                return null;
                            }),
                            // Get elevation from Open-Elevation API
                            fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${coordinates.lat},${coordinates.lon}`)
                                .then(res => res.json())
                                .then(data => data.results?.[0]?.elevation)
                                .catch(() => null)
                        ]);

                        console.log('[ParcelDetailsPanel] Municipality data received:', municipalityData);
                        console.log('[ParcelDetailsPanel] Full response structure:', JSON.stringify(municipalityData, null, 2));

                        if (municipalityData && municipalityData.municipality) {
                            // Use calculated municipality from coordinates (most accurate)
                            const calculatedMunicipality = municipalityData.municipality.name;
                            const distance = municipalityData.municipality.distance_km;
                            console.log(`[ParcelDetailsPanel] Using calculated municipality: ${calculatedMunicipality} (distance: ${distance?.toFixed(2)}km, stored was: ${parcel.municipality || 'none'})`);

                            // Warn if distance is suspiciously large (might be wrong municipality)
                            if (distance && distance > 5) {
                                console.warn(`[ParcelDetailsPanel] ⚠️ Municipality found is ${distance.toFixed(2)}km away - might be incorrect!`);
                            }

                            setLocationInfo({
                                coordinates,
                                elevation: elevation || undefined,
                                municipality: calculatedMunicipality,
                                province: municipalityData.municipality.province,
                                autonomousCommunity: municipalityData.municipality.autonomous_community,
                                country: 'España',
                                hasLocation: true,
                                // Population might be available in municipality data
                                population: municipalityData.municipality.population,
                            });
                            setLoadingLocation(false);
                            return;
                        } else {
                            console.warn('[ParcelDetailsPanel] No municipality found from coordinates, using stored:', parcel.municipality);
                            console.warn('[ParcelDetailsPanel] Response was:', municipalityData);
                            // Coordinates but no municipality found - fallback to stored municipality
                            if (parcel.municipality) {
                                setLocationInfo({
                                    coordinates,
                                    elevation: elevation || undefined,
                                    municipality: parcel.municipality,
                                    province: parcel.province || undefined,
                                    country: 'España',
                                    hasLocation: true,
                                });
                                setLoadingLocation(false);
                                return;
                            }
                        }
                    } catch (err) {
                        console.warn('Error calculating municipality from coordinates:', err);
                        // Fallback to stored municipality if calculation fails
                        if (parcel.municipality) {
                            setLocationInfo({
                                coordinates,
                                municipality: parcel.municipality,
                                province: parcel.province || undefined,
                                country: 'España',
                                hasLocation: true,
                            });
                            setLoadingLocation(false);
                            return;
                        }
                    }
                }

                // Priority 2: Use stored municipality only if we don't have coordinates
                if (parcel.municipality && !coordinates) {
                    setLocationInfo({
                        municipality: parcel.municipality,
                        province: parcel.province || undefined,
                        country: 'España',
                        hasLocation: false,
                    });
                    setLoadingLocation(false);
                    return;
                }

                // Fallback: No coordinates and no stored municipality
                if (!coordinates && !parcel.municipality) {
                    setLocationInfo({
                        country: 'España',
                        hasLocation: false,
                    });
                }
            } catch (err) {
                console.error('Error extracting location info:', err);
                setLocationInfo({
                    country: 'España',
                    hasLocation: false,
                });
            } finally {
                setLoadingLocation(false);
            }
        };

        extractLocationInfo();
    }, [parcel]);

    if (!parcel) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-center">
                    <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">Selecciona una parcela</p>
                    <p className="text-sm text-gray-500 mt-1">Haz clic en una parcela del mapa para ver sus detalles</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50 shrink-0">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-green-600" />
                            Información de la Parcela
                        </h3>
                        {/* Nombre del usuario (grande, arriba) */}
                        <p className="text-base font-semibold text-gray-900 mt-1">
                            {parcel.name || parcel.cadastralReference || 'Parcela sin nombre'}
                        </p>
                        {/* ID interno (pequeño, abajo) */}
                        <p className="text-xs text-gray-400 font-mono mt-1 break-all">
                            {parcel.id}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 space-y-4">
                {/* Agronomic status */}
                <ParcelAgroStatusDetail parcelId={parcel.id} />



                {/* Ubicación */}
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h4 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Ubicación
                    </h4>
                    {loadingLocation ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Cargando información de ubicación...</span>
                        </div>
                    ) : locationInfo ? (
                        <div className="space-y-2 text-sm">
                            {locationInfo.municipality && (
                                <div>
                                    <span className="text-gray-600">Municipio:</span>
                                    <span className="ml-2 font-semibold text-gray-900">{locationInfo.municipality}</span>
                                </div>
                            )}
                            {locationInfo.municipality && locationInfo.population && (
                                <div>
                                    <span className="text-gray-600">Población:</span>
                                    <span className="ml-2 font-semibold text-gray-900">
                                        {locationInfo.population.toLocaleString('es-ES')} habitantes
                                    </span>
                                </div>
                            )}
                            {locationInfo.coordinates && (
                                <div>
                                    <span className="text-gray-600">Coordenadas del centro:</span>
                                    <div className="mt-1">
                                        <span className="font-mono text-xs font-semibold text-gray-900 block">
                                            Lat: {locationInfo.coordinates.lat.toFixed(6)}
                                        </span>
                                        <span className="font-mono text-xs font-semibold text-gray-900 block">
                                            Lon: {locationInfo.coordinates.lon.toFixed(6)}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {locationInfo.elevation !== undefined && (
                                <div>
                                    <span className="text-gray-600">Altitud:</span>
                                    <span className="ml-2 font-semibold text-gray-900">
                                        {locationInfo.elevation.toFixed(0)} m
                                    </span>
                                </div>
                            )}
                            {locationInfo.province && (
                                <div>
                                    <span className="text-gray-600">Provincia:</span>
                                    <span className="ml-2 font-semibold text-gray-900">{locationInfo.province}</span>
                                </div>
                            )}
                            {locationInfo.autonomousCommunity && (
                                <div>
                                    <span className="text-gray-600">Comunidad Autónoma:</span>
                                    <span className="ml-2 font-semibold text-gray-900">{locationInfo.autonomousCommunity}</span>
                                </div>
                            )}
                            <div>
                                <span className="text-gray-600">País:</span>
                                <span className="ml-2 font-semibold text-gray-900">{locationInfo.country}</span>
                            </div>
                            {!locationInfo.coordinates && !locationInfo.municipality && !locationInfo.province && (
                                <p className="text-gray-500 italic">No hay información de ubicación disponible</p>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-500 italic">No hay información de ubicación disponible</p>
                    )}
                </div>

                {/* Características */}
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h4 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                        <Ruler className="w-4 h-4" />
                        Características
                    </h4>
                    <div className="space-y-2 text-sm">
                        <div>
                            <span className="text-gray-600">Área:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                                {parcel.area ? `${parcel.area.toFixed(2)} ha` : 'N/A'}
                            </span>
                        </div>
                        {parcel.cropType && (
                            <div>
                                <span className="text-gray-600">Tipo de cultivo:</span>
                                <span className="ml-2 font-semibold text-gray-900">{parcel.cropType}</span>
                            </div>
                        )}
                        <div>
                            <span className="text-gray-600">Categoría:</span>
                            <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${parcel.category === 'cadastral'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                                }`}>
                                {parcel.category === 'cadastral' ? 'Catastral' : parcel.category === 'managementZone' ? 'Zona de Gestión' : 'Parcela'}
                            </span>
                        </div>
                        {parcel.refParent && (
                            <div>
                                <span className="text-gray-600">Parcela padre:</span>
                                <span className="ml-2 font-mono text-xs text-gray-900 break-all">{parcel.refParent}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Notas */}
                {parcel.notes && (
                    <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                        <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Notas
                        </h4>
                        <p className="text-sm text-gray-700">{parcel.notes}</p>
                    </div>
                )}

                {/* Metadata */}
                {parcel.refFarm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Información Adicional
                        </h4>
                        <div className="space-y-1 text-xs text-gray-600">
                            <div>
                                <span className="font-medium">Granja:</span> {parcel.refFarm}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

