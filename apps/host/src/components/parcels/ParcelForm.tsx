// =============================================================================
// Parcel Form Component - Sprint 1 & 2
// =============================================================================
// Form for parcel metadata (municipality, province, crop type, etc.)

import React, { useState, useEffect } from 'react';
import type { Parcel } from '@/types';
import { calculatePolygonAreaHectares } from '@/utils/geo';

interface ParcelFormProps {
    initialData: Partial<Parcel> | null;
    geometry: any;
    onSave: (data: Partial<Parcel>) => void;
    onCancel: () => void;
    mode: 'create' | 'edit';
}

export const ParcelForm: React.FC<ParcelFormProps> = ({
    initialData,
    geometry,
    onSave,
    onCancel,
    mode,
}) => {
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        cadastralReference: initialData?.cadastralReference || '',
        municipality: initialData?.municipality || '',
        province: initialData?.province || '',
        cropType: initialData?.cropType || '',
        notes: initialData?.notes || '',
    });

    // Update form data when initialData changes (e.g., when cadastral data is loaded)
    useEffect(() => {
        if (initialData) {
            setFormData(prev => ({
                ...prev,
                name: initialData.name || prev.name || '',
                cadastralReference: initialData.cadastralReference || prev.cadastralReference || '',
                municipality: initialData.municipality || prev.municipality || '',
                province: initialData.province || prev.province || '',
                cropType: initialData.cropType || prev.cropType || '',
                notes: initialData.notes || prev.notes || '',
            }));
        }
    }, [initialData]);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate required fields
        if (!formData.cropType) {
            alert('Por favor, selecciona un tipo de cultivo');
            return;
        }

        onSave(formData);
    };

    // Calculate area from geometry
    const calculateArea = () => {
        if (!geometry || !geometry.coordinates) return null;

        const areaHectares = calculatePolygonAreaHectares({
            type: 'Polygon',
            coordinates: geometry.coordinates
        });

        return areaHectares ? areaHectares.toString() : '0.00';
    };

    const area = calculateArea();

    return (
        <form onSubmit={handleSubmit} className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
                {mode === 'create' ? 'Nueva Parcela' : 'Editar Parcela'}
            </h2>

            {/* Name */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de la Parcela <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder={formData.cadastralReference || "Ej: Mi Parcela 1"}
                    required
                />
            </div>

            {/* Cadastral Reference - Show if provided */}
            {formData.cadastralReference && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Referencia Catastral
                    </label>
                    <input
                        type="text"
                        value={formData.cadastralReference}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                    />
                </div>
            )}

            {/* Municipality and Province - Show if provided */}
            {(formData.municipality || formData.province) && (
                <div className="mb-4 grid grid-cols-2 gap-4">
                    {formData.municipality && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Municipio
                            </label>
                            <input
                                type="text"
                                value={formData.municipality}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                            />
                        </div>
                    )}
                    {formData.province && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Provincia
                            </label>
                            <input
                                type="text"
                                value={formData.province}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Crop Type */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Cultivo <span className="text-red-500">*</span>
                </label>
                <select
                    value={formData.cropType}
                    onChange={(e) => handleChange('cropType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                >
                    <option value="">Selecciona un cultivo</option>
                    <option value="vineyard">Viñedo</option>
                    <option value="olive">Olivo</option>
                    <option value="cereal">Cereal</option>
                    <option value="vegetables">Hortalizas</option>
                    <option value="fruit">Frutales</option>
                    <option value="pasture">Pasto</option>
                    <option value="other">Otro</option>
                </select>
            </div>

            {/* Area (read-only, calculated from geometry) */}
            {geometry && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Área Estimada
                    </label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                        {area ? `${area} hectáreas` : 'Calculando...'}
                    </div>
                </div>
            )}

            {/* Notes */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas
                    <span className="text-gray-500 ml-1">(Opcional)</span>
                </label>
                <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={3}
                    placeholder="Información adicional sobre la parcela"
                />
            </div>

            {/* Geometry Status */}
            <div className="mb-6">
                <div className={`p-3 rounded-md ${geometry
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                    <div className="flex items-center">
                        {geometry ? (
                            <>
                                <svg className="h-5 w-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm text-green-800">Geometría definida</span>
                            </>
                        ) : (
                            <>
                                <svg className="h-5 w-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm text-yellow-800">Dibuja la parcela en el mapa</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    type="submit"
                    disabled={!geometry}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                >
                    {mode === 'create' ? 'Crear Parcela' : 'Guardar Cambios'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium transition-colors"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
};
