import React from 'react';
import { X } from 'lucide-react';
import { ParcelForm } from './ParcelForm';
import type { Parcel } from '@/types';

interface ParcelCreationModalProps {
    isOpen: boolean;
    geometry: any;
    onSave: (data: Partial<Parcel>) => void;
    onCancel: () => void;
    cadastralData?: {
        reference: string;
        municipality?: string;
        province?: string;
        address?: string;
    };
}

export const ParcelCreationModal: React.FC<ParcelCreationModalProps> = ({
    isOpen,
    geometry,
    onSave,
    onCancel,
    cadastralData,
}) => {
    if (!isOpen) return null;

    // Build initial data from cadastral data if available
    const initialData = cadastralData ? {
        cadastralReference: cadastralData.reference,
        municipality: cadastralData.municipality || '',
        province: cadastralData.province || '',
        name: cadastralData.reference, // Use reference as default name
    } as Partial<Parcel> : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">
                            Nueva Parcela
                        </h3>
                        {cadastralData && (
                            <p className="text-sm text-gray-600 mt-1">
                                Datos catastrales encontrados: {cadastralData.reference}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <ParcelForm
                    initialData={initialData}
                    geometry={geometry}
                    onSave={onSave}
                    onCancel={onCancel}
                    mode="create"
                />
            </div>
        </div>
    );
};
