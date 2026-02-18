// =============================================================================
// useTenantMunicipality Hook
// =============================================================================
// Hook to get tenant's primary municipality from:
// 1. tenant_weather_locations with is_primary=true
// 2. First parcel's municipality
// 3. Municipality closest to first parcel's centroid
// =============================================================================

import { useState, useEffect } from 'react';
import api from '@/services/api';
import { parcelApi } from '@/services/parcelApi';
interface Municipality {
  code: string;
  name: string;
  province?: string;
}

export const useTenantMunicipality = () => {
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTenantMunicipality = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Try to get primary weather location
        try {
          const locations = await api.getWeatherLocations();
          const primaryLocation = locations.find((loc: any) => loc.is_primary === true);
          
          if (primaryLocation && primaryLocation.municipality_code) {
            setMunicipality({
              code: primaryLocation.municipality_code,
              name: primaryLocation.municipality_name || primaryLocation.label || 'Municipio',
              province: primaryLocation.province
            });
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('[useTenantMunicipality] Error loading weather locations:', err);
        }

        // 2. Try to get municipality from first parcel
        try {
          const parcels = await parcelApi.getParcels();
          
          if (parcels.length > 0) {
            const firstParcel = parcels[0];
            const parcelMunicipality = firstParcel.municipality;
            
            if (parcelMunicipality) {
              // Try to find municipality code from name
              try {
                const searchResult = await api.searchMunicipalities(parcelMunicipality);
                if (searchResult.municipalities && searchResult.municipalities.length > 0) {
                  const found = searchResult.municipalities[0];
                  setMunicipality({
                    code: found.ine_code || found.code,
                    name: found.name,
                    province: found.province
                  });
                  setLoading(false);
                  return;
                }
              } catch (err) {
                console.warn('[useTenantMunicipality] Error searching municipality:', err);
              }
            }

            // 3. If parcel has geometry, find nearest municipality using backend endpoint
            if (firstParcel.geometry && firstParcel.geometry.coordinates) {
              try {
                // Calculate centroid (simplified - use first point of polygon)
                // Type guard: coordinates can be number | number[] | number[][]
                const coords = firstParcel.geometry.coordinates;
                let lon: number | null = null;
                let lat: number | null = null;
                
                // Handle different coordinate structures
                if (Array.isArray(coords)) {
                  if (coords.length > 0) {
                    const firstElement = coords[0];
                    if (Array.isArray(firstElement)) {
                      // Polygon: number[][][] -> coords[0] is number[][]
                      if (firstElement.length > 0 && Array.isArray(firstElement[0])) {
                        // First ring of polygon
                        const firstPoint = firstElement[0];
                        if (Array.isArray(firstPoint) && firstPoint.length >= 2) {
                          lon = firstPoint[0] as number;
                          lat = firstPoint[1] as number;
                        }
                      } else if (firstElement.length >= 2) {
                        // Direct point array [lon, lat]
                        lon = firstElement[0] as number;
                        lat = firstElement[1] as number;
                      }
                    } else if (typeof firstElement === 'number' && coords.length >= 2) {
                      // Direct [lon, lat] array
                      lon = coords[0] as number;
                      lat = coords[1] as number;
                    }
                  }
                }
                
                if (lon !== null && lat !== null) {
                  // Query backend for nearest municipality
                  try {
                    // Use fetch instead of private api.client
                    const token = sessionStorage.getItem('auth_token') || 
                                  (window as any).__keycloak?.token || '';
                    const headers: HeadersInit = {
                      'Content-Type': 'application/json',
                    };
                    if (token) {
                      headers['Authorization'] = `Bearer ${token}`;
                    }
                    
                    const baseUrl = (window as any).__API_BASE_URL || '/api';
                    const url = new URL(`${baseUrl}/weather/municipality/near`, window.location.origin);
                    url.searchParams.set('latitude', lat.toString());
                    url.searchParams.set('longitude', lon.toString());
                    url.searchParams.set('max_distance_km', '50');
                    
                    const response = await fetch(url.toString(), { headers });
                    
                    if (response.ok) {
                      const data = await response.json();
                      if (data?.municipality) {
                        const found = data.municipality;
                        setMunicipality({
                          code: found.ine_code || found.code,
                          name: found.name,
                          province: found.province
                        });
                        setLoading(false);
                        return;
                      }
                    } else if (response.status !== 404) {
                      // 404 is OK - no municipality found nearby
                      console.warn('[useTenantMunicipality] Error querying nearest municipality:', response.status);
                    }
                  } catch (err: any) {
                    console.warn('[useTenantMunicipality] Error querying nearest municipality:', err);
                  }
                }
              } catch (err) {
                console.warn('[useTenantMunicipality] Error finding nearest municipality:', err);
              }
            }
          }
        } catch (err) {
          console.warn('[useTenantMunicipality] Error loading parcels:', err);
        }

        // No municipality found
        setMunicipality(null);
        setLoading(false);
      } catch (err: any) {
        console.error('[useTenantMunicipality] Error:', err);
        setError(err.message || 'Error loading municipality');
        setLoading(false);
      }
    };

    loadTenantMunicipality();
  }, []);

  return { municipality, loading, error };
};
