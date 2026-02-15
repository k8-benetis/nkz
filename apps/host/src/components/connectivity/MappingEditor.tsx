// =============================================================================
// MappingEditor - No-Code IoT Data Mapping Configuration
// =============================================================================
// Allows users to configure how raw sensor data maps to SDM attributes

import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Trash2,
    AlertCircle,
    Check,
    ArrowRight,
    Code,
    Save,
    RefreshCw,
    Info,
    Sparkles
} from 'lucide-react';
import {
    MappingEntry,
    SDMAttribute,
    getSDMAttributes
} from '@/services/deviceProfilesApi';

// =============================================================================
// Types
// =============================================================================

interface MappingEditorProps {
    mappings: MappingEntry[];
    sdmEntityType: string;
    onChange: (mappings: MappingEntry[]) => void;
    readonly?: boolean;
}

// =============================================================================
// Validation
// =============================================================================

const JEXL_PATTERNS = [
    { label: 'Sin cambio', value: 'val' },
    { label: 'Escalar (×0.1)', value: 'val * 0.1' },
    { label: 'Escalar (×10)', value: 'val * 10' },
    { label: 'Offset (+273)', value: 'val + 273' },
    { label: 'Fahrenheit → Celsius', value: '(val - 32) * 5 / 9' },
];

const validateJexl = (expr: string): { valid: boolean; error?: string } => {
    if (!expr || expr === 'val') return { valid: true };

    const dangerous = ['import', 'require', 'eval', 'exec', 'function', 'process'];
    for (const d of dangerous) {
        if (expr.toLowerCase().includes(d)) {
            return { valid: false, error: `Expresión no permitida: '${d}'` };
        }
    }

    // Basic pattern check
    if (/^val\s*[\+\-\*\/]\s*[\d\.]+$/.test(expr) ||
        /^[\d\.]+\s*[\+\-\*\/]\s*val$/.test(expr) ||
        /^\(val\s*[\+\-]\s*[\d\.]+\)\s*\*\s*[\d\.]+\s*\/\s*[\d\.]+$/.test(expr)) {
        return { valid: true };
    }

    return { valid: false, error: 'Usa patrones simples: val, val * 0.1, val + 273' };
};

// =============================================================================
// Component
// =============================================================================

export const MappingEditor: React.FC<MappingEditorProps> = ({
    mappings,
    sdmEntityType,
    onChange,
    readonly = false
}) => {
    const [sdmAttributes, setSdmAttributes] = useState<SDMAttribute[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<number, string>>({});

    // Load SDM attributes for the selected entity type
    const loadAttributes = useCallback(async () => {
        if (!sdmEntityType) return;
        setLoading(true);
        try {
            const attrs = await getSDMAttributes(sdmEntityType);
            setSdmAttributes(attrs);
        } catch (error) {
            console.error('Error loading SDM attributes:', error);
        } finally {
            setLoading(false);
        }
    }, [sdmEntityType]);

    useEffect(() => {
        loadAttributes();
    }, [loadAttributes]);

    const addMapping = () => {
        onChange([
            ...mappings,
            {
                incoming_key: '',
                target_attribute: '',
                type: 'Number',
                transformation: 'val'
            }
        ]);
    };

    const removeMapping = (index: number) => {
        const newMappings = mappings.filter((_, i) => i !== index);
        onChange(newMappings);

        // Clear error for removed mapping
        const newErrors = { ...errors };
        delete newErrors[index];
        setErrors(newErrors);
    };

    const updateMapping = (index: number, field: keyof MappingEntry, value: string) => {
        const newMappings = [...mappings];
        newMappings[index] = { ...newMappings[index], [field]: value };

        // Auto-set type based on selected attribute
        if (field === 'target_attribute') {
            const attr = sdmAttributes.find(a => a.name === value);
            if (attr) {
                newMappings[index].type = attr.type as MappingEntry['type'];
            }
        }

        // Validate JEXL expression
        if (field === 'transformation') {
            const result = validateJexl(value);
            const newErrors = { ...errors };
            if (!result.valid) {
                newErrors[index] = result.error || 'Expresión inválida';
            } else {
                delete newErrors[index];
            }
            setErrors(newErrors);
        }

        onChange(newMappings);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <h3 className="text-white font-medium">Mapeo de Datos</h3>
                </div>
                {!readonly && (
                    <button
                        onClick={addMapping}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Añadir
                    </button>
                )}
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">
                    Configura cómo los datos del sensor se traducen a atributos estándar SDM.
                    El campo origen es la clave que envía el dispositivo; el destino es el atributo normalizado.
                </p>
            </div>

            {/* Mappings Table */}
            <div className="space-y-3">
                {mappings.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border border-dashed border-gray-700 rounded-lg">
                        <Code className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No hay mapeos configurados</p>
                        <p className="text-xs mt-1">Haz clic en "Añadir" para crear uno</p>
                    </div>
                ) : (
                    mappings.map((mapping, index) => (
                        <div
                            key={index}
                            className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 space-y-3"
                        >
                            {/* Row 1: Incoming Key → Target Attribute */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Origen (clave del sensor)
                                    </label>
                                    <input
                                        type="text"
                                        value={mapping.incoming_key}
                                        onChange={(e) => updateMapping(index, 'incoming_key', e.target.value)}
                                        placeholder="temp_out"
                                        disabled={readonly}
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                                    />
                                </div>

                                <ArrowRight className="w-5 h-5 text-gray-500 mt-5" />

                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Destino (atributo SDM)
                                    </label>
                                    <select
                                        value={mapping.target_attribute}
                                        onChange={(e) => updateMapping(index, 'target_attribute', e.target.value)}
                                        disabled={readonly || loading}
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {sdmAttributes.map((attr) => (
                                            <option key={attr.name} value={attr.name}>
                                                {attr.name} ({attr.type})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {!readonly && (
                                    <button
                                        onClick={() => removeMapping(index)}
                                        className="mt-5 p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Eliminar mapeo"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Row 2: Transformation */}
                            <div className="flex items-start gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Transformación (JEXL)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={mapping.transformation || 'val'}
                                            onChange={(e) => updateMapping(index, 'transformation', e.target.value)}
                                            placeholder="val"
                                            disabled={readonly}
                                            className={`flex-1 px-3 py-2 bg-gray-900 border rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:ring-1 disabled:opacity-50 ${errors[index]
                                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                                    : 'border-gray-700 focus:border-purple-500 focus:ring-purple-500'
                                                }`}
                                        />
                                        <select
                                            value=""
                                            onChange={(e) => updateMapping(index, 'transformation', e.target.value)}
                                            disabled={readonly}
                                            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-400 text-sm"
                                        >
                                            <option value="">Plantillas...</option>
                                            {JEXL_PATTERNS.map((p) => (
                                                <option key={p.value} value={p.value}>
                                                    {p.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {errors[index] && (
                                        <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {errors[index]}
                                        </p>
                                    )}
                                </div>

                                <div className="w-24">
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Unidad
                                    </label>
                                    <input
                                        type="text"
                                        value={mapping.unitCode || ''}
                                        onChange={(e) => updateMapping(index, 'unitCode', e.target.value)}
                                        placeholder="CEL"
                                        disabled={readonly}
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Validation Summary */}
            {Object.keys(errors).length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <p className="text-xs text-red-300">
                        Hay {Object.keys(errors).length} mapeo(s) con errores de validación
                    </p>
                </div>
            )}
        </div>
    );
};

export default MappingEditor;
