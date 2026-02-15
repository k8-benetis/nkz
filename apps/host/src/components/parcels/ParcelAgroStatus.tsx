/**
 * ParcelAgroStatus - Component to display agronomic semaphores for a parcel
 * Uses lazy loading with IntersectionObserver for performance
 */

import React, { useState, useEffect, useRef } from 'react';
import { Wind, Droplets, Thermometer, Radio, Cloud } from 'lucide-react';
import api from '@/services/api';

interface ParcelAgroStatusProps {
  parcelId: string;
  isVisible?: boolean; // For manual control, otherwise uses IntersectionObserver
}

interface AgroStatus {
  semaphores: {
    spraying: 'optimal' | 'caution' | 'not_suitable' | 'unknown';
    workability: 'optimal' | 'too_wet' | 'too_dry' | 'caution' | 'unknown';
    irrigation: 'satisfied' | 'alert' | 'deficit' | 'unknown';
  };
  source_confidence: 'SENSOR_REAL' | 'OPEN-METEO';
  metrics?: {
    temperature?: number;
    humidity?: number;
    delta_t?: number;
    water_balance?: number;
    wind_speed?: number;
  };
  timestamp?: string;
}

const SemaphoreIcon: React.FC<{
  status: string;
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
}> = ({ status, icon, label, tooltip }) => {
  const getColor = () => {
    switch (status) {
      case 'optimal':
      case 'satisfied':
        return 'text-green-700 bg-green-100 border-green-300';
      case 'caution':
      case 'alert':
        return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'not_suitable':
      case 'too_wet':
      case 'too_dry':
      case 'deficit':
        return 'text-red-700 bg-red-100 border-red-300';
      default:
        return 'text-gray-500 bg-gray-100 border-gray-300';
    }
  };

  return (
    <div
      className={`flex items-center justify-center w-9 h-9 rounded-full border-2 ${getColor()} transition-all hover:scale-110 cursor-help`}
      title={tooltip || label}
    >
      {icon}
    </div>
  );
};

export const ParcelAgroStatus: React.FC<ParcelAgroStatusProps> = ({
  parcelId,
  isVisible: manualVisible,
}) => {
  const [status, setStatus] = useState<AgroStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    if (manualVisible !== undefined) {
      setIsVisible(manualVisible);
      return;
    }

    if (!ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before visible
        threshold: 0.1,
      }
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [manualVisible]);

  // Load status when visible
  useEffect(() => {
    if (!isVisible || status || loading) return;

    const loadStatus = async () => {
      setLoading(true);
      setError(null);

      try {
        // Call API endpoint
        const response = await api.getParcelAgroStatus(parcelId);
        setStatus(response);
      } catch (err: any) {
        console.error('Error loading parcel agro status:', err);
        const errorMsg = err?.response?.data?.error || err?.response?.data?.details || err?.message || 'Error cargando estado agronómico';
        // Check if it's a location/geometry error
        if (errorMsg.toLowerCase().includes('location') || errorMsg.toLowerCase().includes('geometry')) {
          setError('Parcela sin ubicación');
        } else {
          setError(errorMsg);
        }
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
  }, [parcelId, isVisible, status, loading]);

  if (!isVisible) {
    return (
      <div ref={ref} className="flex items-center gap-2 text-gray-400">
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (error || !status) {
    const msg =
      error && error.toLowerCase().includes('location')
        ? 'Sin ubicación de parcela'
        : error || 'Sin datos';
    return (
      <div className="flex items-center gap-2 text-gray-400" title={msg}>
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] text-gray-500">—</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] text-gray-500">—</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] text-gray-500">—</span>
        </div>
      </div>
    );
  }

  const { semaphores, source_confidence, metrics } = status;

  // Enhanced tooltip content
  const getSprayingTooltip = () => {
    const statusText = semaphores.spraying === 'optimal' 
      ? 'Óptimo para pulverizar' 
      : semaphores.spraying === 'caution' 
      ? 'Precaución: condiciones límite' 
      : 'No recomendado';
    const deltaT = metrics?.delta_t ? `\nΔT: ${metrics.delta_t.toFixed(1)}°C` : '';
    const wind = metrics?.wind_speed ? `\nViento: ${(metrics.wind_speed * 3.6).toFixed(1)} km/h` : '';
    return `${statusText}${deltaT}${wind}`;
  };

  const getWorkabilityTooltip = () => {
    const statusText = semaphores.workability === 'optimal' 
      ? 'Suelo en buen tempero' 
      : semaphores.workability === 'too_wet' 
      ? 'Demasiado húmedo' 
      : semaphores.workability === 'too_dry' 
      ? 'Demasiado seco' 
      : 'Precaución';
    const humidity = metrics?.humidity ? `\nHumedad: ${metrics.humidity.toFixed(0)}%` : '';
    return `${statusText}${humidity}`;
  };

  const getIrrigationTooltip = () => {
    const statusText = semaphores.irrigation === 'satisfied' 
      ? 'Riego satisfecho' 
      : semaphores.irrigation === 'alert' 
      ? 'Alerta: vigilar' 
      : 'Déficit hídrico';
    const balance = metrics?.water_balance !== undefined
      ? `\nBalance 3 días: ${metrics.water_balance > 0 ? '+' : ''}${metrics.water_balance.toFixed(1)} mm`
      : '';
    return `${statusText}${balance}`;
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Spraying Semaphore */}
      <SemaphoreIcon
        status={semaphores.spraying}
        icon={<Wind className="w-4 h-4" />}
        label="Pulverización"
        tooltip={getSprayingTooltip()}
      />

      {/* Workability Semaphore */}
      <SemaphoreIcon
        status={semaphores.workability}
        icon={<Droplets className="w-4 h-4" />}
        label="Tempero"
        tooltip={getWorkabilityTooltip()}
      />

      {/* Irrigation Semaphore */}
      <SemaphoreIcon
        status={semaphores.irrigation}
        icon={<Thermometer className="w-4 h-4" />}
        label="Riego"
        tooltip={getIrrigationTooltip()}
      />

      {/* Source Confidence Indicator - More visible */}
      <div 
        className="ml-1 flex items-center" 
        title={source_confidence === 'SENSOR_REAL' ? 'Datos de sensor real' : 'Datos de modelo meteorológico (Open-Meteo)'}
      >
        {source_confidence === 'SENSOR_REAL' ? (
          <Radio className="w-3.5 h-3.5 text-blue-600" />
        ) : (
          <Cloud className="w-3.5 h-3.5 text-gray-400" />
        )}
      </div>
    </div>
  );
};

