/**
 * PlacementToolbar - Floating Action Bar for 3D Model Placement
 * 
 * Appears when in PREVIEW_MODEL or STAMP_INSTANCES mode.
 * Provides compact controls for adjusting scale, rotation, and stamp options.
 * 
 * Position: Fixed, centered at bottom of screen
 */

import React from 'react';
import { Check, X, RotateCw, Maximize2, Paintbrush, Grid } from 'lucide-react';
import { useViewer } from '@/context/ViewerContext';

interface PlacementToolbarProps {
    onConfirm?: () => void;
    onCancel?: () => void;
}

export const PlacementToolbar: React.FC<PlacementToolbarProps> = ({
    onConfirm,
    onCancel,
}) => {
    const {
        mapMode,
        modelPlacement,
        stampOptions,
        stampInstances,
        updateModelPlacement,
        updateStampOptions,
        confirmModelPlacement,
        cancelModelPlacement,
        confirmStampMode,
        cancelStampMode,
    } = useViewer();

    // Only render in placement modes
    if (mapMode !== 'PREVIEW_MODEL' && mapMode !== 'STAMP_INSTANCES') {
        return null;
    }

    const isPreviewMode = mapMode === 'PREVIEW_MODEL';
    const isStampMode = mapMode === 'STAMP_INSTANCES';

    const handleConfirm = () => {
        if (isPreviewMode) {
            confirmModelPlacement();
        } else if (isStampMode) {
            confirmStampMode();
        }
        onConfirm?.();
    };

    const handleCancel = () => {
        if (isPreviewMode) {
            cancelModelPlacement();
        } else if (isStampMode) {
            cancelStampMode();
        }
        onCancel?.();
    };

    // Handlers for sliders
    const handleScaleChange = (value: number) => {
        if (isPreviewMode && modelPlacement) {
            updateModelPlacement({ scale: value });
        }
    };

    const handleRotationChange = (heading: number) => {
        if (isPreviewMode && modelPlacement) {
            updateModelPlacement({ rotation: [heading, modelPlacement.rotation[1], modelPlacement.rotation[2]] });
        }
    };

    const handleDensityChange = (value: number) => {
        if (isStampMode) {
            updateStampOptions({ density: value });
        }
    };

    const handleBrushSizeChange = (value: number) => {
        if (isStampMode) {
            updateStampOptions({ brushSize: value });
        }
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 p-3 flex items-center gap-4">
                {/* Mode Indicator */}
                <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPreviewMode ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                        }`}>
                        {isPreviewMode ? <Maximize2 className="w-4 h-4" /> : <Paintbrush className="w-4 h-4" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                        {isPreviewMode ? 'Preview' : `Stamp (${stampInstances.length})`}
                    </span>
                </div>

                {/* Scale Control */}
                <div className="flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 text-gray-500" />
                    <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={isPreviewMode ? (modelPlacement?.scale ?? 1) : 1}
                        onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                        className="w-20 h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-600"
                        disabled={!isPreviewMode}
                    />
                    <span className="text-xs text-gray-500 w-8">
                        {isPreviewMode ? `${(modelPlacement?.scale ?? 1).toFixed(1)}x` : '-'}
                    </span>
                </div>

                {/* Rotation Control (Preview Mode Only) */}
                {isPreviewMode && (
                    <div className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-gray-500" />
                        <input
                            type="range"
                            min="0"
                            max="360"
                            step="15"
                            value={modelPlacement?.rotation[0] ?? 0}
                            onChange={(e) => handleRotationChange(parseFloat(e.target.value))}
                            className="w-20 h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-600"
                        />
                        <span className="text-xs text-gray-500 w-10">
                            {modelPlacement?.rotation[0] ?? 0}°
                        </span>
                    </div>
                )}

                {/* Stamp Mode Controls */}
                {isStampMode && (
                    <>
                        {/* Density */}
                        <div className="flex items-center gap-2">
                            <Grid className="w-4 h-4 text-gray-500" />
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.1"
                                value={stampOptions.density}
                                onChange={(e) => handleDensityChange(parseFloat(e.target.value))}
                                className="w-16 h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-green-600"
                            />
                            <span className="text-xs text-gray-500 w-8">
                                {(stampOptions.density * 100).toFixed(0)}%
                            </span>
                        </div>

                        {/* Brush Size */}
                        <div className="flex items-center gap-2">
                            <Paintbrush className="w-4 h-4 text-gray-500" />
                            <input
                                type="range"
                                min="1"
                                max="20"
                                step="1"
                                value={stampOptions.brushSize}
                                onChange={(e) => handleBrushSizeChange(parseFloat(e.target.value))}
                                className="w-16 h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-green-600"
                            />
                            <span className="text-xs text-gray-500 w-10">
                                {stampOptions.brushSize}m
                            </span>
                        </div>
                    </>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
                    <button
                        onClick={handleCancel}
                        className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                        title="Cancelar"
                    >
                        <X className="w-5 h-5 text-gray-600" />
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="w-9 h-9 rounded-lg bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
                        title="Confirmar"
                    >
                        <Check className="w-5 h-5 text-white" />
                    </button>
                </div>
            </div>

            {/* Instructions hint */}
            <div className="text-center mt-2">
                <p className="text-xs text-gray-500 bg-black/50 text-white px-3 py-1 rounded-full inline-block">
                    {isPreviewMode
                        ? 'Ajusta escala y rotación, luego confirma'
                        : 'Haz clic para colocar instancias, arrastra para pintar'}
                </p>
            </div>
        </div>
    );
};

export default PlacementToolbar;
