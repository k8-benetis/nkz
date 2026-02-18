// =============================================================================
// Weather Widget Component - AEMET Integration
// =============================================================================
// Widget para mostrar información meteorológica de AEMET en el dashboard
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Cloud, Thermometer, Droplets, Wind, MapPin, Search, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import api from '@/services/api';
import { useI18n } from '@/context/I18nContext';
import { useTenantMunicipality } from '@/hooks/useTenantMunicipality';
import { logger } from '@/utils/logger';

interface WeatherData {
  observed_at: string;
  temp_avg?: number;
  temp_min?: number;
  temp_max?: number;
  humidity_avg?: number;
  precip_mm?: number;
  solar_rad_w_m2?: number;
  eto_mm?: number;
  wind_speed_ms?: number;
  wind_direction_deg?: number;
  pressure_hpa?: number;
  gdd_accumulated?: number;
  viento?: {
    direccion: string;
    velocidad: number;
  };
}

interface ForecastData {
  fecha: string;
  t_maxima: number;
  t_minima: number;
  estado_cielo?: string;
  precipitacion_proba?: number;
}

interface WeatherWidgetProps {
  municipalityCode?: string;
  municipalityName?: string;
  latitude?: number;
  longitude?: number;
  onMunicipalitySelect?: (code: string, name: string) => void;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  municipalityCode,
  municipalityName,
  latitude: _latitude,
  longitude: _longitude,
  onMunicipalitySelect,
}) => {
  const { t } = useI18n();
  
  // Auto-detect municipality from tenant if not provided
  const { municipality: tenantMunicipality } = useTenantMunicipality();
  
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMunicipalitySearch, setShowMunicipalitySearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [municipalities, setMunicipalities] = useState<Array<{ code: string; name: string; province?: string; fullName?: string }>>([]);
  const [searchingMunicipalities, setSearchingMunicipalities] = useState(false);
  const [selectedMunicipalityName, setSelectedMunicipalityName] = useState<string | null>(
    municipalityName || tenantMunicipality?.name || null
  );
  const [selectedMunicipalityProvince, setSelectedMunicipalityProvince] = useState<string | null>(null);
  
  // Determine which municipality code to use (priority: prop > tenant)
  const effectiveMunicipalityCode = municipalityCode || tenantMunicipality?.code;

  // Load weather data
  useEffect(() => {
    if (effectiveMunicipalityCode) {
      loadWeatherByMunicipality(
        effectiveMunicipalityCode,
        municipalityName || tenantMunicipality?.name,
        tenantMunicipality?.province
      );
    } else {
      // Try to get primary location from tenant weather locations
      loadWeatherFromPrimaryLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMunicipalityCode, municipalityCode, tenantMunicipality]);

  const loadWeatherFromPrimaryLocation = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get tenant weather locations and use primary one
      const locations = await api.getWeatherLocations();
      const primaryLocation = locations.find((loc: any) => loc.is_primary) || locations[0];
      
      if (primaryLocation) {
        await loadWeatherByMunicipality(primaryLocation.municipality_code, primaryLocation.municipality_name);
      } else {
        // No error if no location - just show empty state
        setError(null);
        setWeatherData(null);
        setForecast([]);
      }
    } catch (err: any) {
      logger.error('Error loading weather from primary location:', err);
      // Don't show error if it's just that there's no location configured
      if (err.response?.status !== 404) {
      setError(err.message || t('weather.error_loading'));
      } else {
        setError(null);
        setWeatherData(null);
        setForecast([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fallback function to fetch from Open-Meteo directly when no data in DB
  const fetchOpenMeteoDirectly = async (lat: number, lon: number) => {
    try {
      // Request 7 days to ensure we have enough data for 5 complete days
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,pressure_msl&forecast_days=7&timezone=Europe%2FMadrid`
      );
      if (!response.ok) throw new Error('Open-Meteo API error');
      return await response.json();
    } catch (err) {
      logger.error('[WeatherWidget] Error fetching from Open-Meteo:', err);
      return null;
    }
  };

  const loadWeatherByMunicipality = async (code?: string, name?: string, province?: string) => {
    const targetCode = code || municipalityCode;
    if (!targetCode) return;

    setLoading(true);
    setError(null);

    try {
      // Get latest weather observations from backend
      const observations = await api.getLatestWeatherObservations({
        municipality_code: targetCode,
        source: 'OPEN-METEO',
        data_type: 'HISTORY',
      });

      // Get forecast data (ask for more days to ensure 5 uniques)
      let forecastData: { observations?: any[]; count?: number } | null = null;
      try {
        forecastData = await api.getWeatherObservations({
          municipality_code: targetCode,
          source: 'OPEN-METEO',
          data_type: 'FORECAST',
          limit: 200, // Request more observations to ensure we get 5 complete days (24 hours * 7 days = 168 hours)
        });
      } catch (forecastErr) {
        logger.warn('Error fetching forecast data:', forecastErr);
        // Continue without forecast - not critical
      }

      // If no data in DB, try fallback to Open-Meteo direct
      if (observations.length === 0 || !forecastData || forecastData.observations?.length === 0) {
        logger.debug('[WeatherWidget] No data in DB, using Open-Meteo fallback', {
          observationsCount: observations.length,
          forecastDataCount: forecastData?.observations?.length || 0
        });
        
        // Get municipality coordinates from search result
        const municipalitySearch = await api.searchMunicipalities(name || targetCode);
        const municipality = municipalitySearch.municipalities?.[0];
        
        logger.debug('[WeatherWidget] Municipality found:', municipality);
        
        if (municipality && municipality.latitude && municipality.longitude) {
          const openMeteoData = await fetchOpenMeteoDirectly(
            municipality.latitude,
            municipality.longitude
          );
          
          logger.debug('[WeatherWidget] Open-Meteo data received:', {
            hasCurrent: !!openMeteoData?.current,
            hasHourly: !!openMeteoData?.hourly,
            hourlyKeys: openMeteoData?.hourly ? Object.keys(openMeteoData.hourly) : []
          });
          
          if (openMeteoData && openMeteoData.current) {
            const current = openMeteoData.current;
            const hourly = openMeteoData.hourly;
            
            // Transform Open-Meteo data to widget format
            if (name) setSelectedMunicipalityName(name);
            if (province) setSelectedMunicipalityProvince(province || null);
            
            setWeatherData({
              observed_at: new Date().toISOString(),
              temp_avg: current.temperature_2m,
              temp_min: current.temperature_2m,
              temp_max: current.temperature_2m,
              humidity_avg: current.relative_humidity_2m,
              precip_mm: 0, // Current doesn't have precipitation
              pressure_hpa: current.pressure_msl,
              viento: {
                direccion: current.wind_direction_10m ? `${current.wind_direction_10m}°` : 'N',
                velocidad: current.wind_speed_10m ? Math.round(current.wind_speed_10m * 3.6) : 0,
              },
            });
            
            // Transform forecast from hourly data
            if (hourly && hourly.time && hourly.temperature_2m) {
              logger.debug('[WeatherWidget] Processing hourly forecast data', {
                timeCount: hourly.time?.length,
                tempCount: hourly.temperature_2m?.length
              });
              
              const forecastByDate = new Map<string, { temps: number[]; precip: number[] }>();
              const nowForGrouping = new Date();
              // Get today at midnight in local timezone
              const todayForGrouping = new Date(nowForGrouping.getFullYear(), nowForGrouping.getMonth(), nowForGrouping.getDate());
              const maxDate = new Date(todayForGrouping);
              maxDate.setDate(maxDate.getDate() + 5); // Today + 5 days = 6 days total (to ensure we have 5 complete days after filtering)
              
              logger.debug('[WeatherWidget] Date range for forecast:', {
                today: todayForGrouping.toISOString(),
                maxDate: maxDate.toISOString()
              });
              
              // Group hourly data by date
              for (let i = 0; i < hourly.time.length && i < hourly.temperature_2m.length; i++) {
                const timeStr = hourly.time[i];
                if (!timeStr) continue;
                
                // Open-Meteo returns dates in format "2025-12-13T00:00" (ISO format)
                const obsDate = new Date(timeStr);
                if (isNaN(obsDate.getTime())) {
                  logger.warn('[WeatherWidget] Invalid date:', timeStr);
                  continue;
                }
                
                // Get date only (without time) for grouping
                const obsDateOnly = new Date(obsDate.getFullYear(), obsDate.getMonth(), obsDate.getDate());
                const dateKey = obsDateOnly.toISOString().split('T')[0];
                
                // Include only today and future dates (exclude yesterday)
                // Compare dates properly to avoid timezone issues
                const todayTime = todayForGrouping.getTime();
                const obsTime = obsDateOnly.getTime();
                if (obsTime >= todayTime && obsTime <= maxDate.getTime()) {
                  if (!forecastByDate.has(dateKey)) {
                    forecastByDate.set(dateKey, { temps: [], precip: [] });
                  }
                  
                  const dayData = forecastByDate.get(dateKey)!;
                  const temp = hourly.temperature_2m[i];
                  if (temp != null && !isNaN(temp) && isFinite(temp)) {
                    dayData.temps.push(temp);
                  }
                  if (hourly.precipitation && hourly.precipitation[i] != null) {
                    const precip = hourly.precipitation[i];
                    if (!isNaN(precip) && isFinite(precip)) {
                      dayData.precip.push(precip);
                    }
                  }
                }
              }
              
              logger.debug('[WeatherWidget] Forecast grouped by date:', {
                datesCount: forecastByDate.size,
                dates: Array.from(forecastByDate.keys()),
                sampleDay: forecastByDate.size > 0 ? {
                  date: Array.from(forecastByDate.keys())[0],
                  tempsCount: forecastByDate.get(Array.from(forecastByDate.keys())[0])?.temps.length,
                  precipCount: forecastByDate.get(Array.from(forecastByDate.keys())[0])?.precip.length
                } : null
              });
              
              // Transform grouped data to forecast format
              const nowForTransform = new Date();
              const todayForTransform = new Date(nowForTransform.getFullYear(), nowForTransform.getMonth(), nowForTransform.getDate());
              const todayTime = todayForTransform.getTime();
              
              const forecastTransformed = Array.from(forecastByDate.entries())
                .map(([dateKey, dayData]) => {
                  const date = new Date(dateKey + 'T00:00:00');
                  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                  const maxTemp = dayData.temps.length > 0 ? Math.max(...dayData.temps) : 0;
                  const minTemp = dayData.temps.length > 0 ? Math.min(...dayData.temps) : 0;
                  const maxPrecip = dayData.precip.length > 0 ? Math.max(...dayData.precip) : 0;
                  
                  return {
                    fecha: date.toISOString(),
                    fechaDate: dateOnly,
                    t_maxima: maxTemp,
                    t_minima: minTemp,
                    estado_cielo: maxPrecip > 0 ? 'Lluvia' : 'Despejado',
                    precipitacion_proba: maxPrecip > 0 ? Math.min(100, maxPrecip * 10) : 0,
                  };
                })
                .filter(item => item.fechaDate.getTime() >= todayTime) // Exclude yesterday explicitly
                .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                .slice(0, 5); // Take exactly 5 days (today + 4 more)
              
              logger.debug('[WeatherWidget] Forecast transformed:', forecastTransformed);
              
              if (forecastTransformed.length > 0) {
                setForecast(forecastTransformed);
                logger.debug('[WeatherWidget] Forecast set successfully, length:', forecastTransformed.length);
              } else {
                logger.warn('[WeatherWidget] Forecast transformed but empty');
                setForecast([]);
              }
            } else {
              logger.warn('[WeatherWidget] No hourly data available for forecast', {
                hasHourly: !!hourly,
                hasTime: !!hourly?.time,
                hasTemp: !!hourly?.temperature_2m
              });
              setForecast([]);
            }
            
            // Update municipality name if provided
            if (name && onMunicipalitySelect) {
              onMunicipalitySelect(targetCode, name);
            }
            
            setLoading(false);
            return; // Exit early, we got data from Open-Meteo
          } else {
            logger.warn('[WeatherWidget] Open-Meteo data incomplete', {
              hasData: !!openMeteoData,
              hasCurrent: !!openMeteoData?.current
            });
          }
        } else {
          logger.warn('[WeatherWidget] Municipality coordinates not found', municipality);
        }
      }

      // If we have data from DB, use it (existing logic)
      if (observations.length > 0) {
        const latest = observations[0];
        if (name) setSelectedMunicipalityName(name);
        if (province) setSelectedMunicipalityProvince(province || null);
        // Transform to widget format
        setWeatherData({
          observed_at: latest.observed_at,
          temp_avg: latest.temp_avg,
          temp_min: latest.temp_min,
          temp_max: latest.temp_max,
          humidity_avg: latest.humidity_avg,
          precip_mm: latest.precip_mm,
          pressure_hpa: latest.pressure_hpa,
          viento: {
            direccion: latest.wind_direction_deg ? `${latest.wind_direction_deg}°` : 'N',
            velocidad: latest.wind_speed_ms ? Math.round(latest.wind_speed_ms * 3.6) : 0, // Convert m/s to km/h
          },
        });
      }

      // Process forecast from DB if available
      let forecastProcessed = false;
      if (forecastData && forecastData.observations && forecastData.observations.length > 0) {
        // Transform forecast to widget format
        // Group hourly observations by date and calculate daily min/max
        const nowForDB = new Date();
        const todayForDB = new Date(nowForDB.getFullYear(), nowForDB.getMonth(), nowForDB.getDate());
        const maxDate = new Date(todayForDB);
        maxDate.setDate(maxDate.getDate() + 5); // Today + 5 days = 6 days total (to ensure we have 5 complete days after filtering)
        
        // Group observations by date (hourly -> daily aggregation)
        const dailyData = new Map<string, {
          temps: number[];
          precip: number[];
          weatherCodes: string[];
        }>();
        
        forecastData.observations.forEach((obs: any) => {
          if (!obs.observed_at) return;
          
          const obsDate = new Date(obs.observed_at);
          if (isNaN(obsDate.getTime())) {
            logger.warn('[WeatherWidget] Invalid date in forecast observation:', obs.observed_at);
            return;
          }
          
          // Get date only (ignore time)
          const obsDateOnly = new Date(obsDate.getFullYear(), obsDate.getMonth(), obsDate.getDate());
          const dateKey = obsDateOnly.toISOString().split('T')[0];
          
          // Only include today and future dates (exclude yesterday)
          // Compare dates properly to avoid timezone issues
          const todayTime = todayForDB.getTime();
          const obsTime = obsDateOnly.getTime();
          if (obsTime >= todayTime && obsTime <= maxDate.getTime()) {
            if (!dailyData.has(dateKey)) {
              dailyData.set(dateKey, { temps: [], precip: [], weatherCodes: [] });
            }
            
            const dayData = dailyData.get(dateKey)!;
            
            // Collect temperatures (use temp_avg if temp_min/max not available)
            if (obs.temp_avg !== null && obs.temp_avg !== undefined) {
              dayData.temps.push(obs.temp_avg);
            }
            if (obs.temp_min !== null && obs.temp_min !== undefined) {
              dayData.temps.push(obs.temp_min);
            }
            if (obs.temp_max !== null && obs.temp_max !== undefined) {
              dayData.temps.push(obs.temp_max);
            }
            
            // Collect precipitation
            if (obs.precip_mm !== null && obs.precip_mm !== undefined && obs.precip_mm > 0) {
              dayData.precip.push(obs.precip_mm);
            }
            
            // Collect weather codes
            if (obs.metadata?.weather_code) {
              dayData.weatherCodes.push(obs.metadata.weather_code);
            }
          }
        });
        
        // Transform to forecast format (calculate min/max from collected temps)
        const nowForDBTransform = new Date();
        const todayForDBTransform = new Date(nowForDBTransform.getFullYear(), nowForDBTransform.getMonth(), nowForDBTransform.getDate());
        const todayTime = todayForDBTransform.getTime();
        
        const forecastTransformed = Array.from(dailyData.entries())
          .map(([dateKey, dayData]) => {
            const dateOnly = new Date(dateKey + 'T00:00:00');
            const temps = dayData.temps.filter(t => t !== null && t !== undefined);
            const t_maxima = temps.length > 0 ? Math.max(...temps) : null;
            const t_minima = temps.length > 0 ? Math.min(...temps) : null;
            const totalPrecip = dayData.precip.reduce((sum, p) => sum + p, 0);
            const hasPrecip = totalPrecip > 0;
            
            return {
              fecha: dateKey,
              fechaDate: new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate()),
              t_maxima: t_maxima || 0,
              t_minima: t_minima || 0,
              estado_cielo: hasPrecip ? 'Lluvia' : 'Despejado',
              precipitacion_proba: hasPrecip ? Math.min(100, totalPrecip * 10) : 0,
            };
          })
          .filter(item => item.fechaDate.getTime() >= todayTime) // Exclude yesterday explicitly
          .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
          .slice(0, 5); // Get first 5 days
        
        if (forecastTransformed.length > 0) {
          setForecast(forecastTransformed);
          forecastProcessed = true;
          logger.debug('[WeatherWidget] Forecast successfully processed from DB:', forecastTransformed.length, 'days');
        } else {
          logger.warn(`[WeatherWidget] Forecast from DB is empty. Total observations: ${forecastData.observations.length}`);
          logger.debug('[WeatherWidget] Daily data keys:', Array.from(dailyData.keys()));
        }
      }

      // If forecast not processed from DB, try Open-Meteo fallback
      if (!forecastProcessed) {
        logger.debug('[WeatherWidget] No forecast in DB or empty, trying Open-Meteo fallback for forecast');
        
        // Get municipality coordinates
        let municipality = null;
        try {
          const municipalitySearch = await api.searchMunicipalities(name || targetCode);
          municipality = municipalitySearch.municipalities?.[0];
        } catch (err) {
          logger.warn('[WeatherWidget] Error searching municipality for forecast:', err);
        }
        
        if (municipality && municipality.latitude && municipality.longitude) {
          try {
            const openMeteoData = await fetchOpenMeteoDirectly(
              municipality.latitude,
              municipality.longitude
            );
            
            if (openMeteoData && openMeteoData.hourly && openMeteoData.hourly.time && openMeteoData.hourly.temperature_2m) {
              const hourly = openMeteoData.hourly;
              
              logger.debug('[WeatherWidget] Processing forecast from Open-Meteo fallback', {
                timeCount: hourly.time?.length,
                tempCount: hourly.temperature_2m?.length
              });
              
              const forecastByDate = new Map<string, { temps: number[]; precip: number[] }>();
              const nowForFallback = new Date();
              const todayForFallback = new Date(nowForFallback.getFullYear(), nowForFallback.getMonth(), nowForFallback.getDate());
              const maxDate = new Date(todayForFallback);
              maxDate.setDate(maxDate.getDate() + 5); // Today + 5 days = 6 days total (to ensure we have 5 complete days after filtering)
              
              // Group hourly data by date
              for (let i = 0; i < hourly.time.length && i < hourly.temperature_2m.length; i++) {
                const timeStr = hourly.time[i];
                if (!timeStr) continue;
                
                const obsDate = new Date(timeStr);
                if (isNaN(obsDate.getTime())) {
                  logger.warn('[WeatherWidget] Invalid date in forecast:', timeStr);
                  continue;
                }
                
                const obsDateOnly = new Date(obsDate.getFullYear(), obsDate.getMonth(), obsDate.getDate());
                const dateKey = obsDateOnly.toISOString().split('T')[0];
                
                // Include only today and future dates (exclude yesterday)
                // Compare dates properly to avoid timezone issues
                const todayTime = todayForFallback.getTime();
                const obsTime = obsDateOnly.getTime();
                if (obsTime >= todayTime && obsTime <= maxDate.getTime()) {
                  if (!forecastByDate.has(dateKey)) {
                    forecastByDate.set(dateKey, { temps: [], precip: [] });
                  }
                  
                  const dayData = forecastByDate.get(dateKey)!;
                  const temp = hourly.temperature_2m[i];
                  if (temp != null && !isNaN(temp) && isFinite(temp)) {
                    dayData.temps.push(temp);
                  }
                  if (hourly.precipitation && hourly.precipitation[i] != null) {
                    const precip = hourly.precipitation[i];
                    if (!isNaN(precip) && isFinite(precip)) {
                      dayData.precip.push(precip);
                    }
                  }
                }
              }
              
              // Transform grouped data to forecast format
              const nowForFallbackTransform = new Date();
              const todayForFallbackTransform = new Date(nowForFallbackTransform.getFullYear(), nowForFallbackTransform.getMonth(), nowForFallbackTransform.getDate());
              const todayTime = todayForFallbackTransform.getTime();
              
              const forecastTransformed = Array.from(forecastByDate.entries())
                .map(([dateKey, dayData]) => {
                  const date = new Date(dateKey + 'T00:00:00');
                  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                  const maxTemp = dayData.temps.length > 0 ? Math.max(...dayData.temps) : 0;
                  const minTemp = dayData.temps.length > 0 ? Math.min(...dayData.temps) : 0;
                  const maxPrecip = dayData.precip.length > 0 ? Math.max(...dayData.precip) : 0;
                  
                  return {
                    fecha: date.toISOString(),
                    fechaDate: dateOnly,
                    t_maxima: maxTemp,
                    t_minima: minTemp,
                    estado_cielo: maxPrecip > 0 ? 'Lluvia' : 'Despejado',
                    precipitacion_proba: maxPrecip > 0 ? Math.min(100, maxPrecip * 10) : 0,
                  };
                })
                .filter(item => item.fechaDate.getTime() >= todayTime) // Exclude yesterday explicitly
                .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                .slice(0, 5); // Take exactly 5 days (today + 4 more)
              
              if (forecastTransformed.length > 0) {
                setForecast(forecastTransformed);
                logger.debug('[WeatherWidget] Forecast from Open-Meteo fallback set successfully:', forecastTransformed.length, 'days');
              } else {
                logger.warn('[WeatherWidget] Forecast from Open-Meteo fallback is empty');
                setForecast([]);
              }
            } else {
              logger.warn('[WeatherWidget] Open-Meteo data incomplete for forecast fallback', {
                hasData: !!openMeteoData,
                hasHourly: !!openMeteoData?.hourly,
                hasTime: !!openMeteoData?.hourly?.time,
                hasTemp: !!openMeteoData?.hourly?.temperature_2m
              });
              setForecast([]);
            }
          } catch (err) {
            logger.warn('[WeatherWidget] Error fetching forecast from Open-Meteo fallback:', err);
            setForecast([]);
          }
        } else {
          logger.warn('[WeatherWidget] Cannot get forecast: municipality coordinates not available', {
            municipality: municipality,
            hasLat: !!municipality?.latitude,
            hasLon: !!municipality?.longitude
          });
          setForecast([]);
        }
      }

      // Update municipality name if provided
      if (name && onMunicipalitySelect) {
        onMunicipalitySelect(targetCode, name);
      }
    } catch (err: any) {
      logger.error('Error loading weather by municipality:', err);
      const errorMessage = err.response?.data?.detail || err.message || t('weather.error_loading');
      setError(errorMessage);
      // Clear data on error
      setWeatherData(null);
      setForecast([]);
    } finally {
      setLoading(false);
    }
  };

  const searchMunicipalities = async (term: string) => {
    if (term.length < 2) {
      setMunicipalities([]);
      return;
    }

    setSearchingMunicipalities(true);
    try {
      logger.debug('[WeatherWidget] Searching municipalities with term:', term);
      // Search in catalog using API endpoint (searches AEMET/INE catalog)
      const response = await api.searchMunicipalities(term);
      logger.debug('[WeatherWidget] Search response:', response);
      const municipalities = response.municipalities || [];
      
      const filtered = municipalities.map((mun: any) => ({
        code: mun.ine_code || mun.code,
        name: mun.name,
        province: mun.province,
        fullName: mun.province ? `${mun.name} (${mun.province})` : mun.name,
      }));
      
      logger.debug('[WeatherWidget] Filtered municipalities:', filtered);
      setMunicipalities(filtered);
    } catch (err: any) {
      logger.error('[WeatherWidget] Error searching municipalities:', err);
      logger.error('[WeatherWidget] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      setMunicipalities([]);
      // Show error to user
      setError(`Error buscando municipios: ${err.message || 'Error desconocido'}`);
    } finally {
      setSearchingMunicipalities(false);
    }
  };

  useEffect(() => {
    if (searchTerm) {
      const timeout = setTimeout(() => searchMunicipalities(searchTerm), 300);
      return () => clearTimeout(timeout);
    } else {
      setMunicipalities([]);
    }
  }, [searchTerm]);

  const handleMunicipalitySelect = async (code: string, name: string, province?: string) => {
    if (onMunicipalitySelect) {
      onMunicipalitySelect(code, name);
    }
    setSelectedMunicipalityName(name);
    setSelectedMunicipalityProvince(province || null);
    setShowMunicipalitySearch(false);
    setSearchTerm('');
    setMunicipalities([]);
    
    // Ensure location exists in tenant_weather_locations
    try {
      const locations = await api.getWeatherLocations();
      const locationExists = locations.some((loc: any) => loc.municipality_code === code);
      
      if (!locationExists) {
        // Create location automatically if it doesn't exist
        await api.createWeatherLocation({
          municipality_code: code,
          is_primary: locations.length === 0, // Set as primary if it's the first one
          label: name,
        });
      }
    } catch (err) {
      logger.warn('Error ensuring weather location exists:', err);
      // Continue anyway - the widget can still work without the location in the DB
    }
    
    // Load weather for selected municipality
    await loadWeatherByMunicipality(code, name, province);
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">{t('weather.widget_title')}</h2>
              <p className="text-sm text-blue-100">
                {selectedMunicipalityName || municipalityName || tenantMunicipality?.name || t('weather.widget_subtitle_select')}
                {selectedMunicipalityProvince || tenantMunicipality?.province ? ` (${selectedMunicipalityProvince || tenantMunicipality?.province})` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMunicipalitySearch(!showMunicipalitySearch)}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-white text-sm flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              {municipalityName ? t('weather.change_municipality') : t('weather.search_municipality')}
            </button>
            <button
              onClick={() => effectiveMunicipalityCode && loadWeatherByMunicipality(
                effectiveMunicipalityCode,
                municipalityName || tenantMunicipality?.name,
                tenantMunicipality?.province
              )}
              disabled={loading || !effectiveMunicipalityCode}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-white disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Municipality Search */}
      {showMunicipalitySearch && (
        <div className="p-4 bg-gray-50 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('weather.search_placeholder')}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchingMunicipalities && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>
          {searchingMunicipalities ? (
            <div className="mt-2 p-4 text-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              <p className="text-sm">Buscando municipios...</p>
            </div>
          ) : municipalities.length > 0 ? (
            <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
              {municipalities.map((municipality) => (
                <button
                  key={municipality.code}
                  onClick={() => handleMunicipalitySelect(municipality.code, municipality.name, municipality.province)}
                  className="w-full px-4 py-2 text-left hover:bg-blue-50 transition flex items-center gap-2 border-b border-gray-100 last:border-b-0"
                >
                  <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 block truncate">
                      {municipality.fullName || municipality.name}
                    </span>
                    {municipality.province && municipality.name !== municipality.province && (
                      <span className="text-xs text-gray-500">{municipality.province}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : searchTerm.length >= 2 ? (
            <div className="mt-2 p-3 text-sm text-gray-500 text-center bg-gray-50 rounded-lg">
              No se encontraron municipios. Intenta con otro término de búsqueda.
            </div>
          ) : null}
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800 text-sm font-medium">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {loading && !weatherData ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">{t('weather.loading')}</p>
          </div>
        ) : weatherData ? (
          <>
            {/* Current Weather */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Thermometer className="w-5 h-5 text-orange-600" />
                  <span className="text-xs font-medium text-orange-700">{t('weather.temperature')}</span>
                </div>
                <p className="text-2xl font-bold text-orange-900">{weatherData.temp_avg?.toFixed(1) || 'N/A'}°C</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700">{t('weather.humidity')}</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{weatherData.humidity_avg?.toFixed(0) || 'N/A'}%</p>
              </div>

              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wind className="w-5 h-5 text-gray-600" />
                  <span className="text-xs font-medium text-gray-700">{t('weather.wind')}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{weatherData.viento?.velocidad || weatherData.wind_speed_ms ? Math.round((weatherData.wind_speed_ms || 0) * 3.6) : 'N/A'} km/h</p>
                <p className="text-xs text-gray-600 mt-1">{weatherData.viento?.direccion || (weatherData.wind_direction_deg ? `${weatherData.wind_direction_deg}°` : 'N/A')}</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud className="w-5 h-5 text-purple-600" />
                  <span className="text-xs font-medium text-purple-700">{t('weather.pressure')}</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">{weatherData.pressure_hpa?.toFixed(0) || 'N/A'} hPa</p>
              </div>
            </div>

            {/* Forecast */}
            {forecast.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('weather.forecast_5_days') || 'Previsión 5 días'}</h3>
                <div className="grid grid-cols-5 gap-2">
                  {forecast.slice(0, 5).map((day, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-2">
                        {new Date(day.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                      </p>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-lg font-bold text-gray-900">{day.t_maxima?.toFixed(0) || 'N/A'}°</span>
                        <span className="text-sm text-gray-500">{day.t_minima?.toFixed(0) || 'N/A'}°</span>
                      </div>
                      <p className="text-xs text-gray-600">{day.estado_cielo || 'Despejado'}</p>
                      {day.precipitacion_proba && day.precipitacion_proba > 0 && (
                        <p className="text-xs text-blue-600 mt-1">💧 {day.precipitacion_proba.toFixed(0)}%</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  ⚠️ Previsión no disponible. Los datos se están cargando en segundo plano.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">{t('weather.no_data')}</p>
            <button
              onClick={() => setShowMunicipalitySearch(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {t('weather.search_municipality_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

