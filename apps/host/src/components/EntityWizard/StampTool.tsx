
/**
 * StampTool - Mass Placement Tool using Global Viewer
 * 
 * Features:
 * - Controls global STAMP_INSTANCES mode via ViewerContext
 * - Syncs instances back to parent form
 * - No embedded map (fixes overlay issue)
 */

import React, { useEffect } from 'react';
import { Eraser } from 'lucide-react';
import { useViewer } from '@/context/ViewerContext';

export interface InstanceData {
  // Business logic properties
  lat: number;
  lng: number; // Mapping lng -> lon internally
  height: number;
  scale: number;
  rotation: number;

  // Backwards compatibility for internal usage if needed
  position?: { x: number; y: number; z: number };
}

interface StampToolProps {
  modelUrl?: string; // URL of the GLB model
  onInstancesChange: (instances: InstanceData[]) => void;
  height?: string;
  disabled?: boolean;
}

export const StampTool: React.FC<StampToolProps> = ({
  modelUrl,
  onInstancesChange,
  height: _height = 'h-32', // Reduced default height since no map
  disabled = false
}) => {
  const {
    startStampMode,
    cancelStampMode,
    updateStampOptions,
    stampInstances,
    stampOptions
  } = useViewer();

  // Sync instances to parent
  useEffect(() => {
    // Convert ViewerContext StampInstance (lon) to InstanceData (lng)
    const formattedInstances: InstanceData[] = stampInstances.map(inst => ({
      lat: inst.lat,
      lng: inst.lon,
      height: inst.height,
      scale: inst.scale,
      rotation: inst.rotation,
      // position: not available/needed for form submission usually
    }));
    onInstancesChange(formattedInstances);
  }, [stampInstances, onInstancesChange]);

  // Initialize Mode
  useEffect(() => {
    if (disabled || !modelUrl) {
      // If disabled, we might want to stop stamping but keep instances?
      // Usually if disabled, we just don't start the mode.
      return;
    }

    startStampMode(modelUrl, {
      brushSize: 5,
      density: 0.5,
      randomScale: [0.8, 1.2],
      randomRotation: true
    });

    return () => {
      cancelStampMode();
    };
  }, [disabled, modelUrl, startStampMode, cancelStampMode]);

  // Handle local Clear
  const handleClear = () => {
    // Simplest way to clear is to restart mode or we need a clearStampInstances method
    // Since context doesn't have clearStampInstances, we can specific set empty?
    // Actually ViewerContext doesn't expose setStampInstances directy.
    // But startStampMode resets it.
    if (modelUrl) {
      startStampMode(modelUrl, stampOptions);
    }
  };

  if (disabled) return null;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500">Tamaño Pincel ({stampOptions.brushSize}m)</label>
            <input
              type="range"
              min="1"
              max="50"
              value={stampOptions.brushSize}
              onChange={e => updateStampOptions({ brushSize: parseInt(e.target.value) })}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-600"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500">Densidad ({(stampOptions.density * 100).toFixed(0)}%)</label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={stampOptions.density}
              onChange={e => updateStampOptions({ density: parseFloat(e.target.value) })}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-600"
            />
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-1">
          <span className="text-sm font-medium text-gray-700">
            <span className="text-blue-600 font-bold">{stampInstances.length}</span> elementos
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center gap-1 transition-colors"
          >
            <Eraser className="w-4 h-4" /> Limpiar Todo
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
        <p className="flex items-center gap-2">
          🖌️ <strong>Modo Pintura Activo:</strong> Haz clic y arrastra sobre el mapa principal para añadir elementos.
        </p>
      </div>
    </div>
  );
};
