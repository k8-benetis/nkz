import React, { useState, useEffect } from 'react';
import {
    Save,
    Trash2,
    AlertTriangle,
    Check,
    X,
    RotateCcw,
    Settings
} from 'lucide-react';
import api from '@/services/api';
import { useI18n } from '@/context/I18nContext';



interface ManagementPanelProps {
    entity: {
        id: string;
        type: string;
        name: string;
        [key: string]: any;
    };
    onUpdate: () => void;
    onDelete: () => void;
}

export const ManagementPanel: React.FC<ManagementPanelProps> = ({
    entity,
    onUpdate,
    onDelete
}) => {
    const { t } = useI18n();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [schema, setSchema] = useState<any>(null);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Record<string, any>>({});

    // Load schema to know editable fields
    useEffect(() => {
        const loadSchema = async () => {
            try {
                // Fetch all schemas or try to find one
                const response = await api.client.get('/sdm/schemas');

                // Handle both array response (find by type) and object response
                let entitySchema = response.data;
                if (Array.isArray(response.data)) {
                    entitySchema = response.data.find((s: any) => s.entityType === entity.type);
                } else if (response.data[entity.type]) {
                    entitySchema = response.data[entity.type];
                }
                setSchema(entitySchema);

            } catch (err) {
                console.warn('Could not load schema for management:', err);
            }
        };

        if (entity.type) {
            loadSchema();
            // Initialize form data from entity
            const initialData: Record<string, any> = {};
            // Helper to extract value from NGSI-LD format or direct property
            Object.keys(entity).forEach(key => {
                if (key === 'id' || key === 'type') return;

                let val = entity[key];
                // Handle NGSI-LD value structure { type: 'Property', value: ... }
                if (val && typeof val === 'object' && 'value' in val) {
                    val = val.value;
                }
                initialData[key] = val;
            });
            setFormData(initialData);
        }
    }, [entity]);

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            // Prepare update object - strictly properties that changed
            // Note: This assumes a generic update endpoint or we construct patch 
            // For now, let's assume we use the standard patching mechanism

            const updates: Record<string, any> = {};
            Object.keys(formData).forEach(key => {
                // Create NGSI-LD structure for update
                updates[key] = {
                    type: 'Property',
                    value: formData[key]
                };
            });

            // API call to update attributes
            await api.client.patch(`/ngsi-ld/v1/entities/${entity.id}/attrs`, updates, {
                headers: { 'Content-Type': 'application/ld+json' }
            });

            setSuccess(t('common.saved_successfully') || 'Guardado correctamente');
            setIsEditing(false);
            if (onUpdate) onUpdate();

            // Clear success message after 3s
            setTimeout(() => setSuccess(null), 3000);

        } catch (err: any) {
            console.error('Error updating entity:', err);
            setError(err.response?.data?.error || err.message || 'Error al guardar');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            await api.deleteEntity(entity.id);
            if (onDelete) onDelete();
        } catch (err: any) {
            console.error('Error deleting entity:', err);
            setError(err.response?.data?.error || err.message || 'Error al eliminar');
            setLoading(false);
            setShowDeleteConfirm(false);
        }
    };

    const renderField = (key: string, value: any) => {
        // Skip internal fields
        if (['id', 'type', 'location', 'createdAt', 'modifiedAt', '@context'].includes(key)) return null;

        // Determine type from schema if possible, else guess
        const attrSchema = schema?.attributes?.[key];
        const type = attrSchema?.type || typeof value;
        const label = attrSchema?.description || key;

        if (!isEditing) {
            return (
                <div key={key} className="flex flex-col py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-2 rounded -mx-2 bg-transparent transition-colors">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</span>
                    <span className="text-gray-800 break-words font-medium">
                        {typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value)}
                    </span>
                </div>
            );
        }

        // Editable Inputs
        if (type === 'Boolean' || typeof value === 'boolean') {
            return (
                <div key={key} className="flex items-center py-3 border-b border-gray-100">
                    <input
                        type="checkbox"
                        id={`field-${key}`}
                        checked={!!formData[key]}
                        onChange={e => setFormData({ ...formData, [key]: e.target.checked })}
                        className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                    />
                    <label htmlFor={`field-${key}`} className="ml-3 text-sm font-medium text-gray-700">
                        {label}
                    </label>
                </div>
            );
        }

        // Number input
        if (type === 'Number' || typeof value === 'number') {
            return (
                <div key={key} className="py-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
                    <input
                        type="number"
                        value={formData[key] || ''}
                        onChange={e => setFormData({ ...formData, [key]: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-shadow text-sm"
                    />
                </div>
            );
        }

        // Default Text
        return (
            <div key={key} className="py-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
                <input
                    type="text"
                    value={formData[key] || ''}
                    onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-shadow text-sm"
                />
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">

            {/* Messages Area */}
            {error && (
                <div className="m-4 mb-0 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="m-4 mb-0 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>{success}</span>
                </div>
            )}

            {/* Main Content - Attributes */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-500" />
                            Propiedades
                        </h3>
                        {!isEditing ? (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="text-sm text-orange-600 hover:text-orange-700 font-medium px-3 py-1 hover:bg-orange-50 rounded-md transition-colors"
                            >
                                Editar
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        // Reset form
                                        setError(null);
                                    }}
                                    className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                    title="Cancelar"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
                                    title="Guardar"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-4 space-y-1">
                        {/* Always show Name */}
                        {renderField('name', formData.name)}

                        {/* Dynamically render other fields based on available data */}
                        {Object.keys(formData).map(key => {
                            if (key === 'name') return null; // Already handled
                            return renderField(key, formData[key]);
                        })}

                        {Object.keys(formData).length <= 1 && (
                            <p className="text-gray-400 text-sm italic text-center py-4">
                                Sin propiedades adicionales
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="p-4 border-t border-gray-200 bg-white">
                {!showDeleteConfirm ? (
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors font-medium"
                    >
                        <Trash2 className="w-4 h-4" />
                        Eliminar Entidad
                    </button>
                ) : (
                    <div className="bg-red-50 rounded-lg border border-red-200 p-4 animate-in zoom-in-95 duration-200">
                        <h4 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            ¿Estás seguro?
                        </h4>
                        <p className="text-sm text-red-800 mb-4">
                            Esta acción eliminará <strong>{entity.name}</strong> permanentemente. No se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={loading}
                                className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 shadow-sm font-medium transition-colors flex justify-center items-center gap-2"
                            >
                                {loading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Confirmar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
