// =============================================================================
// Sensor Inspector - Panel lateral sobre el mapa con telemetría Chart.js
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
    X,
    Activity,
    Thermometer,
    Droplets,
    Battery,
    Clock,
    RefreshCw,
    Gauge,
    MapPin,
    Cpu,
    Cable
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip as ChartTooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import api from '@/services/api';
import { ConnectivityPanel } from './connectivity';
import { ManagementPanel } from './management';
import { Settings } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    ChartTooltip,
);


// =============================================================================
// Types
// =============================================================================

interface TelemetryDataPoint {
    timestamp: string;
    value: number;
}

interface SensorInspectorProps {
    entity: {
        id: string;
        type: string;
        name: string;
        data?: any;
    } | null;
    onClose: () => void;
    isOpen: boolean;
}

interface TelemetryState {
    temperature: TelemetryDataPoint[];
    humidity: TelemetryDataPoint[];
    battery: TelemetryDataPoint[];
    [key: string]: TelemetryDataPoint[];
}

// =============================================================================
// Mini Chart Component
// =============================================================================

interface MiniChartProps {
    data: TelemetryDataPoint[];
    color: string;
    unit: string;
    label: string;
    icon: React.ReactNode;
}

const MiniChart: React.FC<MiniChartProps> = ({ data, color, unit, label, icon }) => {
    const latestValue = data.length > 0 ? data[data.length - 1].value : null;

    const chartData = {
        labels: data.map(d => d.timestamp),
        datasets: [{
            data: data.map(d => d.value),
            borderColor: color,
            borderWidth: 2,
            backgroundColor: `${color}30`,
            fill: true,
            pointRadius: 0,
            tension: 0.4,
        }],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: { enabled: false },
        },
        scales: {
            x: { display: false },
            y: { display: false },
        },
    } as const;

    return (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg`} style={{ backgroundColor: `${color}20` }}>
                        {icon}
                    </div>
                    <span className="text-sm text-gray-400">{label}</span>
                </div>
                <span className="text-lg font-bold text-white">
                    {latestValue !== null ? `${latestValue.toFixed(1)}${unit}` : '--'}
                </span>
            </div>
            <div className="h-16">
                <Line data={chartData} options={chartOptions} />
            </div>
        </div>
    );
};

// =============================================================================
// Main Component
// =============================================================================

export const SensorInspector: React.FC<SensorInspectorProps> = ({
    entity,
    onClose,
    isOpen
}) => {
    const [telemetry, setTelemetry] = useState<TelemetryState>({
        temperature: [],
        humidity: [],
        battery: []
    });
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState<'telemetry' | 'connectivity' | 'management'>('telemetry');



    // Load telemetry data
    const loadTelemetry = useCallback(async () => {
        if (!entity?.id) return;

        setLoading(true);
        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(
                Date.now() - (timeRange === '1h' ? 3600000 : timeRange === '6h' ? 21600000 : 86400000)
            ).toISOString();

            const response = await api.getDeviceTelemetry(entity.id, {
                start_time: startTime,
                end_time: endTime,
                limit: 100
            });

            if (response?.events) {
                const tempData: TelemetryDataPoint[] = [];
                const humData: TelemetryDataPoint[] = [];
                const batData: TelemetryDataPoint[] = [];

                response.events.forEach((event: any) => {
                    const ts = new Date(event.observed_at).toLocaleTimeString('es', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    if (event.payload?.temperature !== undefined) {
                        tempData.push({ timestamp: ts, value: event.payload.temperature });
                    }
                    if (event.payload?.humidity !== undefined) {
                        humData.push({ timestamp: ts, value: event.payload.humidity });
                    }
                    if (event.payload?.battery !== undefined || event.payload?.batteryLevel !== undefined) {
                        batData.push({
                            timestamp: ts,
                            value: event.payload.battery || event.payload.batteryLevel
                        });
                    }
                });

                setTelemetry({
                    temperature: tempData,
                    humidity: humData,
                    battery: batData
                });
                setLastUpdate(new Date());
            }
        } catch (error) {
            console.error('Error loading telemetry:', error);
        } finally {
            setLoading(false);
        }
    }, [entity?.id, timeRange]);

    // Load on entity change or time range change
    useEffect(() => {
        if (isOpen && entity) {
            loadTelemetry();
        }
    }, [isOpen, entity, timeRange, loadTelemetry]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!isOpen || !entity) return;

        const interval = setInterval(loadTelemetry, 30000);
        return () => clearInterval(interval);
    }, [isOpen, entity, loadTelemetry]);

    if (!isOpen || !entity) return null;

    const entityType = entity.type || 'Device';
    const entityName = entity.name || entity.id;

    // Main temperature chart config
    const mainChartData = {
        labels: telemetry.temperature.map(d => d.timestamp),
        datasets: [{
            data: telemetry.temperature.map(d => d.value),
            borderColor: '#f97316',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#f97316',
            tension: 0.4,
        }],
    };

    const mainChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                titleColor: '#9ca3af',
                bodyColor: '#fff',
                titleFont: { size: 11 },
                bodyFont: { size: 13, weight: 'bold' as const },
                padding: 8,
                cornerRadius: 8,
                borderColor: '#374151',
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                ticks: { color: '#6b7280', font: { size: 10 } },
                grid: { color: '#374151', drawBorder: false },
            },
            y: {
                ticks: { color: '#6b7280', font: { size: 10 } },
                grid: { color: '#374151', drawBorder: false },
            },
        },
    } as const;

    return (
        <div className="absolute top-0 right-0 h-full w-96 bg-gray-900/95 backdrop-blur-md shadow-2xl z-50 flex flex-col border-l border-gray-700/50">
            {/* Header */}
            <div className="p-4 border-b border-gray-700/50 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Cpu className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold truncate max-w-[200px]">
                                {entityName}
                            </h3>
                            <p className="text-gray-400 text-xs">{entityType}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Time Range Selector */}
                <div className="flex gap-2 mt-4">
                    {(['1h', '6h', '24h'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${timeRange === range
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {range}
                        </button>
                    ))}
                    <button
                        onClick={loadTelemetry}
                        disabled={loading}
                        className="ml-auto p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 mt-4 border-b border-gray-700/50 pb-0">
                    <button
                        onClick={() => setActiveTab('telemetry')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${activeTab === 'telemetry'
                            ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                            }`}
                    >
                        <Activity className="w-3.5 h-3.5" />
                        Telemetría
                    </button>
                    <button
                        onClick={() => setActiveTab('connectivity')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${activeTab === 'connectivity'
                            ? 'bg-gray-800 text-white border-b-2 border-purple-500'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                            }`}
                    >
                        <Cable className="w-3.5 h-3.5" />
                        Conectividad
                    </button>
                    <button
                        onClick={() => setActiveTab('management')}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${activeTab === 'management'
                            ? 'bg-gray-800 text-white border-b-2 border-red-500'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                            }`}
                    >
                        <Settings className="w-3.5 h-3.5" />
                        Gestión
                    </button>


                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeTab === 'telemetry' ? (
                    /* Telemetry Tab */
                    <>
                        {/* Mini Charts */}
                        {telemetry.temperature.length > 0 && (
                            <MiniChart
                                data={telemetry.temperature}
                                color="#f97316"
                                unit="°C"
                                label="Temperatura"
                                icon={<Thermometer className="w-4 h-4 text-orange-400" />}
                            />
                        )}

                        {telemetry.humidity.length > 0 && (
                            <MiniChart
                                data={telemetry.humidity}
                                color="#3b82f6"
                                unit="%"
                                label="Humedad"
                                icon={<Droplets className="w-4 h-4 text-blue-400" />}
                            />
                        )}

                        {telemetry.battery.length > 0 && (
                            <MiniChart
                                data={telemetry.battery}
                                color="#22c55e"
                                unit="%"
                                label="Batería"
                                icon={<Battery className="w-4 h-4 text-green-400" />}
                            />
                        )}

                        {/* Main Chart (if has data) */}
                        {telemetry.temperature.length > 0 && (
                            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                                <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    Tendencia de Temperatura
                                </h4>
                                <div className="h-48">
                                    <Line data={mainChartData} options={mainChartOptions} />
                                </div>
                            </div>
                        )}

                        {/* No data message */}
                        {Object.values(telemetry).every(arr => arr.length === 0) && !loading && (
                            <div className="text-center py-12 text-gray-500">
                                <Gauge className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>Sin datos de telemetría</p>
                                <p className="text-xs mt-1">Esperando datos del dispositivo...</p>
                            </div>
                        )}

                        {/* Entity Details */}
                        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                            <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                Detalles
                            </h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">ID</span>
                                    <span className="text-gray-300 font-mono text-xs truncate max-w-[180px]" title={entity.id}>
                                        {entity.id}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Tipo</span>
                                    <span className="text-gray-300">{entityType}</span>
                                </div>
                                {lastUpdate && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Actualizado</span>
                                        <span className="text-gray-300 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {lastUpdate.toLocaleTimeString('es')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    /* Other Tabs */
                    activeTab === 'connectivity' ? (
                        <ConnectivityPanel
                            entityId={entity.id}
                            entityType={entityType}
                            entityName={entityName}
                        />
                    ) : (
                        <ManagementPanel
                            entity={entity}
                            onUpdate={() => {
                                loadTelemetry();
                            }}
                            onDelete={() => {
                                onClose();
                                window.location.reload();
                            }}
                        />
                    )
                )}

            </div>
        </div>
    );
};

export default SensorInspector;
