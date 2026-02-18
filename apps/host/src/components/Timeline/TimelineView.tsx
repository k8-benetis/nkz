// =============================================================================
// Timeline View Component - Historical Timeseries Visualization
// =============================================================================
// Visualizador de gráficas históricas con sincronización bidireccional
// con el tiempo global del visor (ViewerContext).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import 'chartjs-adapter-date-fns';
import { es } from 'date-fns/locale';
import { TrendingUp, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { useTimeseries } from '@/hooks/useTimeseries';
import { useViewer } from '@/context/ViewerContext';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  annotationPlugin
);

// =============================================================================
// Types
// =============================================================================

interface TimelineViewProps {
  entityId: string;
  entityType?: string;
  entityName?: string;
}

type TimeRangePreset = '24h' | '7d' | '30d' | 'custom';

// =============================================================================
// Helper Functions
// =============================================================================

function calculatePresetTimeRange(preset: TimeRangePreset): { start_time: string; end_time: string } {
  const end = new Date();
  const start = new Date();
  
  switch (preset) {
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    default:
      // Custom - will be handled separately
      start.setHours(start.getHours() - 24);
  }
  
  return {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };
}

// =============================================================================
// Component
// =============================================================================

export const TimelineView: React.FC<TimelineViewProps> = ({
  entityId,
  entityType: _entityType,
  entityName,
}) => {
  const { currentDate, setCurrentDate } = useViewer();
  
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>('24h');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>(['temp_avg']);
  
  // Calculate time range based on preset or custom
  const timeRange = useMemo(() => {
    if (timeRangePreset === 'custom' && customStart) {
      return {
        start_time: customStart,
        end_time: customEnd || new Date().toISOString(),
      };
    }
    return calculatePresetTimeRange(timeRangePreset);
  }, [timeRangePreset, customStart, customEnd]);

  // Use timeseries hook
  const {
    data,
    isLoading,
    error,
    fetchData,
    setTimeRange: setHookTimeRange,
    setAggregation: _setAggregation,
    aggregation,
    getValuesForAttribute,
  } = useTimeseries({
    entityId,
    autoFetch: true,
    timeRange,
    aggregation: 'hourly', // Default aggregation
  });

  // Available attributes from data
  const availableAttributes = useMemo(() => {
    if (data.length === 0) return [];
    const firstPoint = data[0];
    return Object.keys(firstPoint).filter(key => key !== 'timestamp');
  }, [data]);

  // Update selected attributes when available attributes change
  useEffect(() => {
    if (availableAttributes.length > 0 && selectedAttributes.length === 0) {
      // Auto-select first available attribute
      setSelectedAttributes([availableAttributes[0]]);
    }
  }, [availableAttributes]);

  // Chart data
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    const colors = [
      'rgb(59, 130, 246)',   // Blue
      'rgb(16, 185, 129)',   // Green
      'rgb(239, 68, 68)',    // Red
      'rgb(245, 158, 11)',   // Amber
      'rgb(139, 92, 246)',   // Purple
      'rgb(236, 72, 153)',   // Pink
    ];

    const datasets = selectedAttributes.map((attr, index) => {
      const values = getValuesForAttribute(attr);
      return {
        label: attr,
        data: values.map(v => ({ x: v.timestamp, y: v.value })),
        borderColor: colors[index % colors.length],
        backgroundColor: `${colors[index % colors.length]}20`,
        fill: false,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
      };
    });

    return {
      labels: data.map(d => d.timestamp),
      datasets,
    };
  }, [data, selectedAttributes, getValuesForAttribute]);

  // Check if currentDate is within the displayed time range
  const isCurrentTimeInRange = useMemo(() => {
    if (data.length === 0) return false;
    const currentTimeMs = currentDate.getTime();
    const firstPoint = data[0];
    const lastPoint = data[data.length - 1];
    const firstTime = new Date(firstPoint.timestamp).getTime();
    const lastTime = new Date(lastPoint.timestamp).getTime();
    return currentTimeMs >= firstTime && currentTimeMs <= lastTime;
  }, [data, currentDate]);

  // Chart options with current time indicator
  const chartOptions = useMemo(() => {
    const currentTimeMs = currentDate.getTime();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 750,
        easing: 'easeInOutQuart' as const,
      },
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      onClick: (_event: any, elements: any[]) => {
        if (elements.length > 0) {
          const element = elements[0];
          const datasetIndex = element.datasetIndex;
          const index = element.index;
          const point = chartData.datasets[datasetIndex].data[index];
          
          // Update global time when clicking on chart
          if (point && point.x) {
            const clickedDate = new Date(point.x);
            setCurrentDate(clickedDate);
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleFont: {
            size: 13,
            weight: 'bold' as const,
          },
          bodyFont: {
            size: 12,
          },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          displayColors: true,
          callbacks: {
            title: (items: any[]) => {
              if (items.length > 0 && items[0].parsed.x) {
                const date = new Date(items[0].parsed.x);
                return date.toLocaleString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }
              return '';
            },
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              return `${label}: ${typeof value === 'number' ? value.toFixed(2) : value}`;
            },
          },
        },
        annotation: {
          annotations: {
            currentTimeLine: {
              type: 'line' as const,
              xMin: currentTimeMs,
              xMax: currentTimeMs,
              borderColor: isCurrentTimeInRange ? 'rgb(239, 68, 68)' : 'rgba(239, 68, 68, 0.3)',
              borderWidth: 2,
              borderDash: [8, 4],
              display: true,
              label: {
                content: 'Ahora',
                enabled: isCurrentTimeInRange,
                position: 'end' as const,
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                color: 'white',
                font: {
                  size: 11,
                  weight: 'bold' as const,
                },
                padding: {
                  top: 4,
                  bottom: 4,
                  left: 8,
                  right: 8,
                },
                borderRadius: 4,
              },
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time' as const,
          time: {
            unit: (timeRangePreset === '24h' ? 'hour' : 'day') as 'hour' | 'day',
            displayFormats: {
              hour: 'HH:mm',
              day: 'dd/MM',
            },
          },
          adapters: {
            date: {
              locale: es,
            },
          },
          title: {
            display: true,
            text: 'Tiempo',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Valor',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
      },
    };
  }, [currentDate, chartData, timeRangePreset, setCurrentDate, isCurrentTimeInRange]);

  // Handle preset change
  const handlePresetChange = useCallback((preset: TimeRangePreset) => {
    setTimeRangePreset(preset);
    if (preset !== 'custom') {
      const newRange = calculatePresetTimeRange(preset);
      setHookTimeRange(newRange.start_time, newRange.end_time);
    }
  }, [setHookTimeRange]);

  // Handle custom range apply
  const handleApplyCustomRange = useCallback(() => {
    if (customStart) {
      setHookTimeRange(customStart, customEnd || new Date().toISOString());
    }
  }, [customStart, customEnd, setHookTimeRange]);

  // Toggle attribute selection
  const toggleAttribute = useCallback((attr: string) => {
    setSelectedAttributes(prev => {
      if (prev.includes(attr)) {
        return prev.filter(a => a !== attr);
      } else {
        return [...prev, attr];
      }
    });
  }, []);

  if (error) {
    return (
      <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-800">
            Histórico - {entityName || entityId}
          </h3>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={isLoading}
          className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          title="Actualizar"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Time Range Presets */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handlePresetChange('24h')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            timeRangePreset === '24h'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Últimas 24h
        </button>
        <button
          onClick={() => handlePresetChange('7d')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            timeRangePreset === '7d'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Semana
        </button>
        <button
          onClick={() => handlePresetChange('30d')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            timeRangePreset === '30d'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Mes
        </button>
        <button
          onClick={() => handlePresetChange('custom')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            timeRangePreset === 'custom'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* Custom Range Inputs */}
      {timeRangePreset === 'custom' && (
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <label className="text-xs text-slate-600 mb-1 block">Desde</label>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-600 mb-1 block">Hasta</label>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            onClick={handleApplyCustomRange}
            disabled={!customStart || isLoading}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Attribute Selection */}
      {availableAttributes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-600 self-center">Atributos:</span>
          {availableAttributes.map(attr => (
            <label
              key={attr}
              className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
                selectedAttributes.includes(attr)
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedAttributes.includes(attr)}
                onChange={() => toggleAttribute(attr)}
                className="sr-only"
              />
              {attr}
            </label>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="border border-slate-200 rounded-lg p-4 bg-gradient-to-br from-white to-slate-50/50 shadow-sm" style={{ height: '350px' }}>
        {isLoading && data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-slate-600">Cargando datos...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <TrendingUp className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-sm">No hay datos disponibles para el rango seleccionado</p>
          </div>
        ) : (
          <div className="relative h-full">
            <Line 
              data={chartData} 
              options={chartOptions}
              className="animate-fade-in"
            />
            {/* Current time indicator info */}
            {isCurrentTimeInRange && (
              <div className="absolute top-2 right-2 px-2 py-1 bg-red-500/90 text-white text-xs rounded shadow-sm animate-pulse">
                Tiempo actual visible
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-slate-500 text-center">
        {data.length > 0 && (
          <>
            {data.length} puntos de datos • Agregación: {aggregation} • 
            Haz clic en el gráfico para saltar a ese momento
          </>
        )}
      </div>
    </div>
  );
};

export default TimelineView;

