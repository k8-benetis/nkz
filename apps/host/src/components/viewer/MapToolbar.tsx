// =============================================================================
// Map Toolbar - Contextual Floating Toolbar for Map Interaction Modes
// =============================================================================
// Displays a floating toolbar at the top center of the map when in drawing/editing modes.
// Provides actions specific to the current map mode (Accept, Cancel, Undo, etc.)

import React from 'react';
import { useViewer, MapMode } from '@/context/ViewerContext';
import { CheckCircle2, X, Undo2, Eraser } from 'lucide-react';

interface MapToolbarProps {
    /** Callback when user accepts (completes) the current operation */
    onAccept?: () => void;
    /** Callback when user cancels the current operation */
    onCancel?: () => void;
    /** Callback when user wants to undo last action */
    onUndo?: () => void;
    /** Callback when user wants to clear current drawing */
    onClear?: () => void;
    /** Additional mode-specific actions */
    customActions?: React.ReactNode;
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
    onAccept,
    onCancel,
    onUndo,
    onClear,
    customActions,
}) => {
    const { mapMode, resetMapMode } = useViewer();

    // Only show toolbar when not in VIEW mode
    if (mapMode === 'VIEW') {
        return null;
    }

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        }
        resetMapMode();
    };

    const getModeLabel = (mode: MapMode): string => {
        switch (mode) {
            case 'DRAW_PARCEL':
                return 'Dibujando Parcela';
            case 'SELECT_CADASTRAL':
                return 'Selección Catastral';
            case 'EDIT_GEOMETRY':
                return 'Editando Geometría';
            case 'ZONING':
                return 'Creando Zonas';
            default:
                return 'Modo Activo';
        }
    };

    const getModeInstructions = (mode: MapMode): string => {
        switch (mode) {
            case 'DRAW_PARCEL':
                return 'Haz clic en el mapa para añadir vértices. Click derecho para terminar.';
            case 'SELECT_CADASTRAL':
                return 'Haz clic en el mapa para buscar la parcela catastral en esa ubicación.';
            case 'EDIT_GEOMETRY':
                return 'Arrastra los vértices para modificar la geometría.';
            case 'ZONING':
                return 'Dibuja zonas dentro de la parcela seleccionada.';
            default:
                return '';
        }
    };

    return (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 min-w-[400px]">
                {/* Mode Label */}
                <div className="flex-1">
                    <div className="font-semibold text-slate-800 text-sm">
                        {getModeLabel(mapMode)}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                        {getModeInstructions(mapMode)}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                    {/* Undo */}
                    {onUndo && mapMode === 'DRAW_PARCEL' && (
                        <button
                            onClick={onUndo}
                            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 hover:text-slate-800"
                            title="Deshacer último punto"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                    )}

                    {/* Clear */}
                    {onClear && mapMode === 'DRAW_PARCEL' && (
                        <button
                            onClick={onClear}
                            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 hover:text-slate-800"
                            title="Borrar dibujo"
                        >
                            <Eraser className="w-4 h-4" />
                        </button>
                    )}

                    {/* Custom Actions */}
                    {customActions}

                    {/* Accept */}
                    {onAccept && (
                        <button
                            onClick={onAccept}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium"
                            title="Aceptar"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Aceptar
                        </button>
                    )}

                    {/* Cancel */}
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors flex items-center gap-2 font-medium"
                        title="Cancelar"
                    >
                        <X className="w-4 h-4" />
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

