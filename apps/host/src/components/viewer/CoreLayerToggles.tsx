// =============================================================================
// Core Layer Toggles - Built-in widget for the layer manager
// =============================================================================
// Layer toggle controls for the unified viewer.
// This is a "core" widget that's always available, not loaded from a module.

import React from 'react';
import { useViewer, LayerType } from '@/context/ViewerContext';
import {
    MapPin,
    Bot,
    Gauge,
    Cloud,
    Tractor,
    Leaf,
    Building,
    TreePine,
    Droplets,
    Sprout,
} from 'lucide-react';

interface CoreLayerTogglesProps {
    compact?: boolean;
}

interface LayerDefinition {
    id: LayerType;
    label: string;
    icon: React.ReactNode;
    color: string;
}

const LAYER_DEFINITIONS: LayerDefinition[] = [
    { id: 'parcels', label: 'Parcelas', icon: <MapPin className="w-4 h-4" />, color: 'text-green-600' },
    { id: 'robots', label: 'Robots', icon: <Bot className="w-4 h-4" />, color: 'text-blue-600' },
    { id: 'sensors', label: 'Sensores', icon: <Gauge className="w-4 h-4" />, color: 'text-orange-600' },
    { id: 'machines', label: 'Maquinaria', icon: <Tractor className="w-4 h-4" />, color: 'text-amber-600' },
    { id: 'weather', label: 'Estaciones', icon: <Cloud className="w-4 h-4" />, color: 'text-sky-600' },
    { id: 'livestock', label: 'Ganado', icon: <Leaf className="w-4 h-4" />, color: 'text-emerald-600' },
    { id: 'buildings', label: 'Edificios', icon: <Building className="w-4 h-4" />, color: 'text-slate-600' },
    { id: 'trees', label: 'Árboles', icon: <TreePine className="w-4 h-4" />, color: 'text-lime-600' },
    { id: 'waterSources', label: 'Agua', icon: <Droplets className="w-4 h-4" />, color: 'text-cyan-600' },
    { id: 'vegetation', label: 'Vegetación', icon: <Sprout className="w-4 h-4" />, color: 'text-green-700' },
];

const CoreLayerToggles: React.FC<CoreLayerTogglesProps> = ({ compact = false }) => {
    const { toggleLayer, isLayerActive } = useViewer();

    if (compact) {
        return (
            <div className="flex flex-wrap gap-1">
                {LAYER_DEFINITIONS.map(layer => (
                    <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`p-2 rounded-lg transition-all ${isLayerActive(layer.id)
                            ? 'bg-blue-50 text-blue-600 border border-blue-200'
                            : 'hover:bg-slate-50 text-slate-400 border border-transparent'
                            }`}
                        title={layer.label}
                    >
                        <span className={isLayerActive(layer.id) ? layer.color : 'text-slate-400'}>
                            {layer.icon}
                        </span>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {LAYER_DEFINITIONS.map(layer => (
                <button
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isLayerActive(layer.id)
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'hover:bg-slate-50 text-slate-600'
                        }`}
                >
                    <span className={layer.color}>{layer.icon}</span>
                    <span className="flex-1 text-left text-sm">{layer.label}</span>
                    <div className={`w-3 h-3 rounded-full transition-colors ${isLayerActive(layer.id) ? 'bg-blue-500' : 'bg-slate-300'
                        }`} />
                </button>
            ))}
        </div>
    );
};

export default CoreLayerToggles;
