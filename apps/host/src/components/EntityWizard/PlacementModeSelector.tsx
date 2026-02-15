import React from 'react';
import { MousePointer2, Grid3X3, Brush, Trees, AlertTriangle } from 'lucide-react';

export type PlacementMode = 'single' | 'multi' | 'stamp';

interface PlacementModeSelectorProps {
    mode: PlacementMode;
    onChange: (mode: PlacementMode) => void;
    entityType?: string;
}

export const PlacementModeSelector: React.FC<PlacementModeSelectorProps> = ({ mode, onChange, entityType }) => {

    // Stamp mode is only recommended for vegetation
    const isVegetation = entityType && ['AgriCrop', 'OliveGrove', 'Vineyard', 'AgriTree', 'OliveTree', 'Vine'].includes(entityType);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Single Mode */}
            <button
                type="button"
                onClick={() => onChange('single')}
                className={`p-4 rounded-xl border-2 text-left transition-all relative ${mode === 'single'
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                    }`}
            >
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${mode === 'single' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <MousePointer2 className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="font-semibold text-gray-900">Placement Individual</div>
                        <p className="text-sm text-gray-500 mt-1">
                            Coloca entidades una a una. Ideal para edificios, sensores o infraestructura específica.
                        </p>
                    </div>
                </div>
            </button>

            {/* Stamp Mode */}
            <button
                type="button"
                onClick={() => onChange('stamp')}
                className={`p-4 rounded-xl border-2 text-left transition-all relative ${mode === 'stamp'
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-green-200 hover:bg-gray-50'
                    }`}
            >
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${mode === 'stamp' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Brush className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                            Stamp Mode (Pincel)
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold">GPU INSTANCED</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            Pinta vegetación masiva usando instanciado GPU.
                            <br />
                            <span className="text-xs font-medium">Requiere modelo .glb optimizado (Draco).</span>
                        </p>
                    </div>
                </div>

                {!isVegetation && mode === 'stamp' && (
                    <div className="mt-3 p-2 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Este modo está diseñado para vegetación (Árboles/Cultivos).
                    </div>
                )}
            </button>
        </div>
    );
};
