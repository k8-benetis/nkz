// =============================================================================
// Core Context Panel - Built-in widget for the right panel
// =============================================================================
// Displays details of the selected entity in the unified viewer.
// This is a "core" widget that's always available, not loaded from a module.

import React, { useMemo, useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useModules } from '@/context/ModuleContext';
import { ParcelDetailsPanel } from '@/components/parcels/ParcelDetailsPanel';
import { TimelineView } from '@/components/Timeline/TimelineView';
import { useTelemetry } from '@/hooks/useTelemetry';
import {
    MapPin,
    Bot,
    Gauge,
    Cloud,
    Tractor,
    Leaf,
    Building,
    X,
    Activity,
    Clock,
    Info,
    Thermometer,
    Droplets,
    Zap,
    Loader2,
    AlertCircle,
} from 'lucide-react';

interface CoreContextPanelProps {
    entityData?: any;
}

// =============================================================================
// Sensor Details Panel - Specialized view for AgriSensor
// =============================================================================

const SensorDetailsPanel: React.FC<{ entityData: any }> = ({ entityData }) => {
    // Filter out technical/internal fields
    const ignoredFields = [
        'id', 'type', '@context', '@id',
        '_type', 'original_id', 'created_at', 'updated_at', 'service_path',
        'location', // Showed separately
        'placementState', 'icon2d', 'defaultIconKey',
        'status', // Showed in header
    ];

    // Also ignore lengthy URLs keys if we found a cleaner alternative
    const isTechnicalKey = (key: string) => {
        return key.startsWith('http') ||
            key.includes('smartdatamodels.org') ||
            key.startsWith('urn:') ||
            key.length > 30; // Heuristic for ugly keys
    };

    const attributes = useMemo(() => {
        if (!entityData) return [];

        return Object.entries(entityData)
            .filter(([key]) => !ignoredFields.includes(key) && !isTechnicalKey(key))
            .map(([key, value]: [string, any]) => ({
                key,
                label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim(),
                value: value?.value !== undefined ? value.value : value,
                unit: value?.unitCode || value?.unit,
                observedAt: value?.observedAt
            }));
    }, [entityData]);

    // Extract sensor specific info
    const sensorType = entityData.controlledProperty?.value ||
        (entityData['https://smartdatamodels.org/name']?.value ? 'Sensor IoT' : 'Sensor Genérico');

    const sensorName = entityData.name?.value ||
        entityData['https://smartdatamodels.org/name']?.value ||
        entityData.id?.split(':').pop();

    const location = entityData.location?.value || entityData.location;

    const formatCoordinate = (coord: any) => {
        if (typeof coord === 'number') return coord.toFixed(6);
        return coord;
    };

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-50 border border-orange-100">
                    <Gauge className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate" title={sensorName}>
                        {sensorName}
                    </h3>
                    <p className="text-sm text-slate-500">{sensorType}</p>
                    <p className="text-xs text-slate-400 font-mono truncate mt-1">{entityData.id}</p>
                </div>
            </div>

            {/* Location */}
            {location && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 mb-1">Ubicación</p>
                            {location.type === 'Point' && location.coordinates ? (
                                <div className="text-xs font-mono text-slate-600">
                                    <div className="flex justify-between">
                                        <span>Lat:</span>
                                        <span className="font-medium">{formatCoordinate(location.coordinates[1])}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Lon:</span>
                                        <span className="font-medium">{formatCoordinate(location.coordinates[0])}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-600 truncate">{JSON.stringify(location)}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Properties */}
            {attributes.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Info className="w-4 h-4" />
                        Propiedades
                    </div>
                    <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                        {attributes.map(attr => (
                            <div key={attr.key} className="flex flex-col border-b border-slate-100 last:border-0 pb-2 last:pb-0 mb-2 last:mb-0">
                                <span className="text-xs text-slate-500 uppercase font-semibold">{attr.label}</span>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-sm font-medium text-slate-800">
                                        {String(attr.value)} {attr.unit ? <span className="text-slate-500 text-xs ml-1">{attr.unit}</span> : ''}
                                    </span>
                                    {attr.observedAt && (
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(attr.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Telemetry Section handled by parent */}
        </div>
    );
};

const CoreContextPanel: React.FC<CoreContextPanelProps> = ({ entityData }) => {
    const {
        selectedEntityId,
        selectedEntityType,
        clearSelection,
    } = useViewer();
    const { modules } = useModules();

    // All hooks must run before any early return (rules of hooks)
    const getAllAttributes = useMemo(() => {
        if (!entityData) return [];

        const systemFields = ['id', 'type', '@context', '@id'];
        const attributes: Array<{ key: string; value: any; label: string; observedAt?: string }> = [];

        Object.keys(entityData).forEach(key => {
            if (systemFields.includes(key)) return;

            const attr = entityData[key];
            const value = attr?.value !== undefined ? attr.value : attr;
            const observedAt = attr?.observedAt;

            if (value === null || value === undefined) return;

            const label = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();

            attributes.push({ key, value, label, observedAt });
        });

        return attributes.sort((a, b) => a.label.localeCompare(b.label));
    }, [entityData]);

    const moduleContextPanelContent = useMemo(() => {
        const relevantModules = modules
            .filter(module => {
                const contextPanel = module.metadata?.contextPanel;
                if (!contextPanel) return false;
                if (module.tenantConfig?.enabled === false) return false;
                const relevantEntityTypes = contextPanel.entityTypes || [];
                if (relevantEntityTypes.length > 0 && selectedEntityType) {
                    return relevantEntityTypes.includes(selectedEntityType);
                }
                return true;
            })
            .map(module => ({
                id: module.id,
                displayName: module.displayName,
                contextPanel: module.metadata?.contextPanel || {},
                icon: module.metadata?.icon || module.icon,
                color: module.metadata?.color || '#10B981',
            }));

        if (relevantModules.length === 0) {
            return (
                <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 text-center">
                        Los módulos activos pueden añadir controles adicionales aquí
                    </p>
                </div>
            );
        }

        return (
            <div className="mt-4 space-y-2">
                {relevantModules.map(module => (
                    <div
                        key={module.id}
                        className="p-3 rounded-lg bg-slate-50 border border-slate-200"
                        style={{
                            borderLeftColor: module.color,
                            borderLeftWidth: '3px',
                        }}
                    >
                        <div className="flex items-start gap-2">
                            {module.icon && (
                                <div
                                    className="p-1.5 rounded-md flex-shrink-0"
                                    style={{ backgroundColor: `${module.color}15` }}
                                >
                                    <Leaf className="w-4 h-4" style={{ color: module.color }} />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm text-slate-800 mb-1">
                                    {module.displayName}
                                </h4>
                                {module.contextPanel.description && (
                                    <p className="text-xs text-slate-600 mb-1">
                                        {module.contextPanel.description}
                                    </p>
                                )}
                                {module.contextPanel.instructions && (
                                    <p className="text-xs text-slate-500 italic">
                                        {module.contextPanel.instructions}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [modules, selectedEntityType]);

    // If no entity selected, show placeholder
    if (!selectedEntityId) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                <div className="p-4 rounded-full bg-slate-100 mb-4">
                    <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-medium text-slate-700 mb-2">Ninguna entidad seleccionada</h3>
                <p className="text-sm text-slate-500">
                    Selecciona una entidad del mapa o de la lista para ver sus detalles y opciones de control
                </p>
            </div>
        );
    }

    // Get icon based on entity type
    const getEntityIcon = () => {
        switch (selectedEntityType) {
            case 'AgriParcel': return <MapPin className="w-5 h-5 text-green-600" />;
            case 'AgriculturalRobot': return <Bot className="w-5 h-5 text-blue-600" />;
            case 'AgriSensor': return <Gauge className="w-5 h-5 text-orange-600" />;
            case 'Tractor': return <Tractor className="w-5 h-5 text-amber-600" />;
            case 'WeatherObserved': return <Cloud className="w-5 h-5 text-sky-600" />;
            case 'LivestockAnimal': return <Leaf className="w-5 h-5 text-emerald-600" />;
            case 'AgriBuilding': return <Building className="w-5 h-5 text-slate-600" />;
            default: return <MapPin className="w-5 h-5 text-slate-500" />;
        }
    };

    // Get entity name from data
    const getEntityName = () => {
        if (!entityData) return selectedEntityId;
        return entityData.name?.value || entityData.name || entityData.cadastralReference || selectedEntityId;
    };

    // Get entity status
    const getEntityStatus = () => {
        if (!entityData) return null;
        return entityData.status?.value || entityData.status;
    };

    // Format attribute value for display
    const formatAttributeValue = (value: any): string => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'boolean') return value ? 'Sí' : 'No';
        if (typeof value === 'number') {
            // Format coordinates with more precision
            if (Math.abs(value) < 1 && Math.abs(value) > 0.0001) {
                return value.toFixed(6);
            }
            return value.toString();
        }
        if (Array.isArray(value)) {
            return value.length > 0 ? `${value.length} elemento(s)` : 'Vacío';
        }
        if (typeof value === 'object') {
            // Handle GeoJSON coordinates
            if (value.type === 'Point' && value.coordinates) {
                const [lon, lat] = value.coordinates;
                return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
            }
            if (value.type === 'Polygon' && value.coordinates) {
                return `Polígono (${value.coordinates[0]?.length || 0} puntos)`;
            }
            return JSON.stringify(value).substring(0, 50) + '...';
        }
        return String(value);
    };

    const status = getEntityStatus();

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/80 to-white/80 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    {getEntityIcon()}
                    Detalles
                </h2>
                <button
                    onClick={clearSelection}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
                    title="Cerrar"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Special handling for Parcels - show ParcelDetailsPanel */}
                {selectedEntityType === 'AgriParcel' && entityData ? (
                    <ParcelDetailsPanel
                        parcel={entityData}
                        onClose={clearSelection}
                    />
                ) : selectedEntityType === 'AgriSensor' && entityData ? (
                    <div className="">
                        <SensorDetailsPanel entityData={entityData} />

                        {/* Telemetry Section appended for Sensors */}
                        <div className="px-4 pb-4">
                            <TelemetryTabsSection
                                entityId={selectedEntityId}
                                entityType={selectedEntityType}
                                entityName={entityData?.name}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        {/* Entity Header */}
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-blue-50">
                                {getEntityIcon()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-800 truncate">{getEntityName()}</h3>
                                <p className="text-sm text-slate-500">{selectedEntityType}</p>
                                <p className="text-xs text-slate-400 font-mono truncate mt-1">{selectedEntityId}</p>
                            </div>
                        </div>

                        {/* Status Badge */}
                        {status && (
                            <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status === 'active' || status === 'online' || status === 'working'
                                ? 'bg-green-100 text-green-700'
                                : status === 'idle'
                                    ? 'bg-amber-100 text-amber-700'
                                    : status === 'error'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-slate-100 text-slate-600'
                                }`}>
                                {status}
                            </div>
                        )}

                        {/* Entity Details Section */}
                        {entityData && getAllAttributes.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Info className="w-4 h-4" />
                                    Propiedades
                                </div>
                                <div className="space-y-2 text-sm border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                                    {getAllAttributes.slice(0, 10).map((attr) => (
                                        <div key={attr.key} className="flex justify-between items-start gap-2">
                                            <span className="text-slate-600 min-w-0 flex-1">{attr.label}</span>
                                            <div className="text-right min-w-0 flex-1">
                                                <span className="font-medium text-slate-800 break-words">
                                                    {formatAttributeValue(attr.value)}
                                                </span>
                                                {attr.observedAt && (
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        {new Date(attr.observedAt).toLocaleString('es-ES')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {getAllAttributes.length > 10 && (
                                        <div className="text-xs text-slate-500 text-center pt-2 border-t border-slate-200">
                                            +{getAllAttributes.length - 10} propiedades más
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Telemetry Section with Tabs */}
                        {selectedEntityType && ['AgriculturalRobot', 'Device', 'WeatherStation'].includes(selectedEntityType) && (
                            <TelemetryTabsSection
                                entityId={selectedEntityId}
                                entityType={selectedEntityType}
                                entityName={entityData?.name}
                            />
                        )}

                        {/* History Section (Structure for future implementation) */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <Clock className="w-4 h-4" />
                                Historial de Cambios
                            </div>
                            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                                <p className="text-xs text-slate-500 text-center">
                                    El historial de cambios se mostrará aquí cuando esté disponible
                                </p>
                                {/* TODO: Implement change history from audit logs */}
                            </div>
                        </div>

                        {/* Module-specific information from metadata */}
                        {moduleContextPanelContent}
                    </div>
                )}
            </div>

            {/* Actions - Only show for non-parcel entities */}
            {selectedEntityType !== 'AgriParcel' && (
                <div className="px-4 py-3 border-t border-slate-200/50 bg-slate-50/50">
                    <button
                        onClick={clearSelection}
                        className="w-full py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Limpiar selección
                    </button>
                </div>
            )}
        </div>
    );
};

// =============================================================================
// Entity Telemetry Section Component
// =============================================================================

interface EntityTelemetrySectionProps {
    entityId: string | null;
    entityType: string | null;
    entityName?: any;
}

const EntityTelemetrySection: React.FC<EntityTelemetrySectionProps> = ({
    entityId,
    entityType: _entityType,
    entityName: _entityName,
}) => {
    const {
        latestTelemetry,
        isLoadingLatest,
        error: telemetryError,
        isConnected,
        getMeasurementValue,
        getMeasurementUnit,
        refreshLatest,
    } = useTelemetry({
        deviceId: entityId || '',
        autoFetch: !!entityId,
        enablePolling: !!entityId,
        pollingInterval: 5000,
        maxDataPoints: 20,
    });

    if (!entityId) {
        return null;
    }

    const temperature = getMeasurementValue('temperature') || getMeasurementValue('airTemperature');
    const humidity = getMeasurementValue('humidity') || getMeasurementValue('relativeHumidity');
    const moisture = getMeasurementValue('moisture') || getMeasurementValue('soilMoisture');
    const battery = getMeasurementValue('batteryLevel') || getMeasurementValue('battery');
    const pressure = getMeasurementValue('pressure') || getMeasurementValue('atmosphericPressure');

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Activity className="w-4 h-4" />
                    Telemetría en Tiempo Real
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                    {latestTelemetry && (
                        <span className="text-xs text-slate-500">
                            {new Date(latestTelemetry.observed_at).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            })}
                        </span>
                    )}
                    <button
                        onClick={refreshLatest}
                        disabled={isLoadingLatest}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        title="Actualizar"
                    >
                        {isLoadingLatest ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <Activity className="w-3 h-3" />
                        )}
                    </button>
                </div>
            </div>

            {isLoadingLatest && !latestTelemetry ? (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cargando telemetría...
                    </div>
                </div>
            ) : telemetryError ? (
                <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
                    <div className="flex items-center gap-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4" />
                        <span>{telemetryError}</span>
                    </div>
                </div>
            ) : latestTelemetry ? (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                    <div className="grid grid-cols-2 gap-3">
                        {temperature !== null && (
                            <div className="bg-gradient-to-br from-red-50 to-orange-50 p-2 rounded-lg border border-red-100">
                                <div className="flex items-center justify-between mb-1">
                                    <Thermometer className="w-4 h-4 text-red-600" />
                                    <span className="text-xs text-slate-600">{getMeasurementUnit('temperature') || '°C'}</span>
                                </div>
                                <div className="text-lg font-bold text-red-700">{temperature.toFixed(1)}</div>
                                <div className="text-xs text-slate-600 mt-0.5">Temperatura</div>
                            </div>
                        )}

                        {humidity !== null && (
                            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-2 rounded-lg border border-blue-100">
                                <div className="flex items-center justify-between mb-1">
                                    <Droplets className="w-4 h-4 text-blue-600" />
                                    <span className="text-xs text-slate-600">{getMeasurementUnit('humidity') || '%'}</span>
                                </div>
                                <div className="text-lg font-bold text-blue-700">{humidity.toFixed(1)}</div>
                                <div className="text-xs text-slate-600 mt-0.5">Humedad</div>
                            </div>
                        )}

                        {moisture !== null && (
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-2 rounded-lg border border-green-100">
                                <div className="flex items-center justify-between mb-1">
                                    <Droplets className="w-4 h-4 text-green-600" />
                                    <span className="text-xs text-slate-600">{getMeasurementUnit('moisture') || '%'}</span>
                                </div>
                                <div className="text-lg font-bold text-green-700">{moisture.toFixed(1)}</div>
                                <div className="text-xs text-slate-600 mt-0.5">Humedad Suelo</div>
                            </div>
                        )}

                        {battery !== null && (
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-2 rounded-lg border border-emerald-100">
                                <div className="flex items-center justify-between mb-1">
                                    <Zap className="w-4 h-4 text-emerald-600" />
                                    <span className="text-xs text-slate-600">{getMeasurementUnit('batteryLevel') || '%'}</span>
                                </div>
                                <div className="text-lg font-bold text-emerald-700">{battery.toFixed(1)}</div>
                                <div className="text-xs text-slate-600 mt-0.5">Batería</div>
                            </div>
                        )}

                        {pressure !== null && (
                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-2 rounded-lg border border-purple-100">
                                <div className="flex items-center justify-between mb-1">
                                    <Gauge className="w-4 h-4 text-purple-600" />
                                    <span className="text-xs text-slate-600">{getMeasurementUnit('pressure') || 'hPa'}</span>
                                </div>
                                <div className="text-lg font-bold text-purple-700">{pressure.toFixed(1)}</div>
                                <div className="text-xs text-slate-600 mt-0.5">Presión</div>
                            </div>
                        )}

                        {temperature === null && humidity === null && moisture === null &&
                            battery === null && pressure === null && (
                                <div className="col-span-2 text-center py-4 text-sm text-slate-500">
                                    No hay datos de telemetría disponibles
                                </div>
                            )}
                    </div>

                    {latestTelemetry.payload && Object.keys(latestTelemetry.payload).length > 0 && (
                        <details className="mt-3 pt-3 border-t border-slate-200">
                            <summary className="cursor-pointer text-xs text-slate-600 hover:text-slate-900">
                                Ver datos completos
                            </summary>
                            <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-auto max-h-32">
                                {JSON.stringify(latestTelemetry.payload, null, 2)}
                            </pre>
                        </details>
                    )}
                </div>
            ) : (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                    <p className="text-xs text-slate-500 text-center">
                        No hay datos de telemetría disponibles
                    </p>
                </div>
            )}
        </div>
    );
};

// =============================================================================
// Telemetry Tabs Section Component (Tiempo Real | Histórico)
// =============================================================================

interface TelemetryTabsSectionProps {
    entityId: string | null;
    entityType: string | null;
    entityName?: any;
}

const TelemetryTabsSection: React.FC<TelemetryTabsSectionProps> = ({
    entityId,
    entityType,
    entityName,
}) => {
    const [activeTab, setActiveTab] = useState<'realtime' | 'historical'>('realtime');

    if (!entityId) {
        return null;
    }

    return (
        <div className="space-y-2">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('realtime')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'realtime'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                >
                    Tiempo Real
                </button>
                <button
                    onClick={() => setActiveTab('historical')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'historical'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                >
                    Histórico
                </button>
            </div>

            {/* Tab Content */}
            <div className="mt-2">
                {activeTab === 'realtime' ? (
                    <EntityTelemetrySection
                        entityId={entityId}
                        entityType={entityType}
                        entityName={entityName}
                    />
                ) : (
                    <TimelineView
                        entityId={entityId}
                        entityType={entityType || undefined}
                        entityName={typeof entityName === 'object' && entityName?.value
                            ? entityName.value
                            : typeof entityName === 'string'
                                ? entityName
                                : entityId.split(':').pop() || 'Entidad'}
                    />
                )}
            </div>
        </div>
    );
};

export default CoreContextPanel;
