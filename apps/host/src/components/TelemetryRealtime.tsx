// =============================================================================
// Telemetry Realtime Component - Visualización en tiempo real
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Activity, Thermometer, Droplets, Gauge, Wind, Sun, Zap, AlertCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';

interface TelemetryValue {
  observed_at: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

interface TelemetryRealtimeProps {
  deviceId: string;
  deviceName: string;
  updateInterval?: number; // milliseconds
  maxDataPoints?: number; // máximo de puntos a mantener en memoria
}

export const TelemetryRealtime: React.FC<TelemetryRealtimeProps> = ({
  deviceId,
  deviceName,
  updateInterval = 5000, // 5 segundos por defecto
  maxDataPoints = 50
}) => {
  const { t } = useI18n();
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryValue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const telemetryHistoryRef = useRef<TelemetryValue[]>([]);

  useEffect(() => {
    // Cargar telemetría inicial
    loadLatestTelemetry();

    // Configurar polling periódico
    intervalRef.current = setInterval(() => {
      loadLatestTelemetry();
    }, updateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [deviceId, updateInterval]);

  const loadLatestTelemetry = async () => {
    try {
      const data = await api.getDeviceLatestTelemetry(deviceId);
      
      if (data && data.observed_at) {
        const telemetry: TelemetryValue = {
          observed_at: data.observed_at,
          payload: data.payload || {},
          metadata: data.metadata
        };

        setLatestTelemetry(telemetry);
        setIsConnected(true);
        setError(null);

        // Mantener historial limitado
        telemetryHistoryRef.current = [
          telemetry,
          ...telemetryHistoryRef.current.slice(0, maxDataPoints - 1)
        ];
      } else {
        setIsConnected(false);
      }
    } catch (err: any) {
      console.error('Error loading telemetry:', err);
      setIsConnected(false);
      setError(err?.response?.data?.error || t('sensors.telemetry_error') || 'Error loading telemetry');
    } finally {
      setIsLoading(false);
    }
  };

  const getMeasurementValue = (key: string): number | null => {
    if (!latestTelemetry?.payload) return null;
    
    // Buscar en diferentes formatos posibles
    const value = latestTelemetry.payload[key] || 
                  latestTelemetry.payload[key.toLowerCase()] ||
                  latestTelemetry.payload[key.toUpperCase()];
    
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value?.value !== undefined) return value.value;
    return null;
  };

  const getMeasurementUnit = (key: string): string => {
    if (!latestTelemetry?.payload) return '';
    
    const value = latestTelemetry.payload[key] || 
                  latestTelemetry.payload[key.toLowerCase()] ||
                  latestTelemetry.payload[key.toUpperCase()];
    
    if (typeof value === 'object' && value?.unitCode) return value.unitCode;
    return '';
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    } catch {
      return timestamp;
    }
  };

  if (isLoading && !latestTelemetry) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-center py-8">
          <Activity className="w-8 h-8 text-gray-400 animate-pulse" />
          <span className="ml-2 text-gray-600">{t('sensors.loading_telemetry') || 'Cargando telemetría...'}</span>
        </div>
      </div>
    );
  }

  if (error && !latestTelemetry) {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      </div>
    );
  }

  const temperature = getMeasurementValue('temperature') || getMeasurementValue('airTemperature');
  const humidity = getMeasurementValue('humidity') || getMeasurementValue('relativeHumidity');
  const moisture = getMeasurementValue('moisture') || getMeasurementValue('soilMoisture');
  const pressure = getMeasurementValue('pressure') || getMeasurementValue('atmosphericPressure');
  const windSpeed = getMeasurementValue('windSpeed');
  const solarRadiation = getMeasurementValue('solarRadiation') || getMeasurementValue('parRadiation');
  const battery = getMeasurementValue('batteryLevel') || getMeasurementValue('battery');

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{deviceName}</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-xs text-gray-600">
            {isConnected 
              ? (latestTelemetry ? formatTimestamp(latestTelemetry.observed_at) : 'Conectado')
              : t('sensors.disconnected') || 'Desconectado'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {temperature !== null && (
          <div className="bg-gradient-to-br from-red-50 to-orange-50 p-3 rounded-lg border border-red-100">
            <div className="flex items-center justify-between mb-1">
              <Thermometer className="w-5 h-5 text-red-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('temperature') || '°C'}</span>
            </div>
            <div className="text-2xl font-bold text-red-700">{temperature.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.temperature') || 'Temperatura'}</div>
          </div>
        )}

        {humidity !== null && (
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-3 rounded-lg border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <Droplets className="w-5 h-5 text-blue-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('humidity') || '%'}</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{humidity.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.humidity') || 'Humedad'}</div>
          </div>
        )}

        {moisture !== null && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg border border-green-100">
            <div className="flex items-center justify-between mb-1">
              <Droplets className="w-5 h-5 text-green-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('moisture') || '%'}</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{moisture.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.soil_moisture') || 'Humedad Suelo'}</div>
          </div>
        )}

        {pressure !== null && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-3 rounded-lg border border-purple-100">
            <div className="flex items-center justify-between mb-1">
              <Gauge className="w-5 h-5 text-purple-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('pressure') || 'hPa'}</span>
            </div>
            <div className="text-2xl font-bold text-purple-700">{pressure.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.pressure') || 'Presión'}</div>
          </div>
        )}

        {windSpeed !== null && (
          <div className="bg-gradient-to-br from-gray-50 to-slate-50 p-3 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <Wind className="w-5 h-5 text-gray-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('windSpeed') || 'm/s'}</span>
            </div>
            <div className="text-2xl font-bold text-gray-700">{windSpeed.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.wind_speed') || 'Viento'}</div>
          </div>
        )}

        {solarRadiation !== null && (
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 p-3 rounded-lg border border-yellow-100">
            <div className="flex items-center justify-between mb-1">
              <Sun className="w-5 h-5 text-yellow-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('solarRadiation') || 'W/m²'}</span>
            </div>
            <div className="text-2xl font-bold text-yellow-700">{solarRadiation.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.solar_radiation') || 'Radiación Solar'}</div>
          </div>
        )}

        {battery !== null && (
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-3 rounded-lg border border-emerald-100">
            <div className="flex items-center justify-between mb-1">
              <Zap className="w-5 h-5 text-emerald-600" />
              <span className="text-xs text-gray-600">{getMeasurementUnit('batteryLevel') || '%'}</span>
            </div>
            <div className="text-2xl font-bold text-emerald-700">{battery.toFixed(1)}</div>
            <div className="text-xs text-gray-600 mt-1">{t('sensors.battery') || 'Batería'}</div>
          </div>
        )}

        {temperature === null && humidity === null && moisture === null && 
         pressure === null && windSpeed === null && solarRadiation === null && battery === null && (
          <div className="col-span-full text-center py-8 text-gray-500">
            {t('sensors.no_telemetry_data') || 'No hay datos de telemetría disponibles'}
          </div>
        )}
      </div>

      {latestTelemetry && Object.keys(latestTelemetry.payload).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
              {t('sensors.view_raw_data') || 'Ver datos completos'}
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(latestTelemetry.payload, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

