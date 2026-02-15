// =============================================================================
// Parcel Editor Component - Sprint 1 & 2
// =============================================================================
// Unified editor for creating/editing parcels
// Integrates drawing tools and form

import React, { useState } from 'react';
import { ParcelForm } from './ParcelForm';
import { CesiumPolygonDrawer, type CesiumPolygonDrawerRef } from '@/components/CesiumPolygonDrawer';
import type { Parcel } from '@/types';

interface ParcelEditorProps {
    mode: 'create' | 'edit';
    parcel: Parcel | null;
    onSave: (parcel: Parcel) => void;
    onCancel: () => void;
}

export const ParcelEditor: React.FC<ParcelEditorProps> = ({
    mode,
    parcel,
    onSave,
    onCancel,
}) => {
    const [geometry, setGeometry] = useState<any>(parcel?.geometry || null);
    const [method, setMethod] = useState<'manual' | 'cadastral'>('manual');
    const drawerRef = React.useRef<CesiumPolygonDrawerRef>(null);

    const handleGeometryChange = (newGeometry: any) => {
        console.log('Geometry changed:', newGeometry);
        setGeometry(newGeometry);
    };

    const handleFormSave = (formData: Partial<Parcel>) => {
        if (!geometry) {
            alert('Por favor, dibuja la geometría de la parcela en el mapa');
            return;
        }

        const parcelData: Parcel = {
            id: parcel?.id || `temp-${Date.now()}`,
            ...formData,
            geometry,
            category: 'cadastral', // Always cadastral for parent parcels
        } as Parcel;

        onSave(parcelData);
    };

    return (
        <div className="h-full flex">
            {/* Left Panel - Map */}
            <div className="flex-1 relative">
                {/* Method Selector */}
                <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg p-2">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMethod('manual')}
                            className={`px-4 py-2 rounded-md font-medium transition-colors ${method === 'manual'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            Dibujo Manual
                        </button>
                        <button
                            onClick={() => setMethod('cadastral')}
                            className={`px-4 py-2 rounded-md font-medium transition-colors ${method === 'cadastral'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            disabled
                            title="Disponible en Fase 3"
                        >
                            Selector Catastral
                            <span className="ml-2 text-xs">(Próximamente)</span>
                        </button>
                    </div>
                </div>

                {/* Map - Manual Drawing */}
                {method === 'manual' && (
                    <div className="h-full">
                        <CesiumPolygonDrawer
                            ref={drawerRef}
                            onComplete={(geom) => handleGeometryChange(geom)}
                            initialGeometry={geometry}
                            mode="draw"
                        />
                    </div>
                )}

                {/* Cadastral Selector - Placeholder */}
                {method === 'cadastral' && (
                    <div className="h-full flex items-center justify-center bg-gray-100">
                        <div className="text-center">
                            <svg
                                className="mx-auto h-16 w-16 text-gray-400 mb-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                />
                            </svg>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                Selector Catastral
                            </h3>
                            <p className="text-gray-600">
                                Esta funcionalidad estará disponible en la Fase 3
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel - Form */}
            <div className="w-96 bg-white border-l border-gray-200 overflow-y-auto">
                <ParcelForm
                    initialData={parcel}
                    geometry={geometry}
                    onSave={handleFormSave}
                    onCancel={onCancel}
                    mode={mode}
                />
            </div>
        </div>
    );
};
