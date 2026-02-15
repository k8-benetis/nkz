/**
 * SceneComposer - Interactive 3D Model Preview and Adjustment
 * 
 * Provides a visual preview of uploaded 3D models with controls for:
 * - Rotation (heading, pitch, roll)
 * - Scale
 * - Position preview on terrain
 * 
 * Uses Google's <model-viewer> web component for lightweight 3D rendering
 * without requiring heavy dependencies like Three.js.
 * 
 * @see https://modelviewer.dev/
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  RotateCw, ZoomIn, ZoomOut, RefreshCw, Move,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Maximize2, Eye, EyeOff
} from 'lucide-react';

// Declare model-viewer as a custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'shadow-intensity'?: string;
        'shadow-softness'?: string;
        exposure?: string;
        'environment-image'?: string;
        'camera-orbit'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'field-of-view'?: string;
        loading?: 'auto' | 'lazy' | 'eager';
        poster?: string;
        style?: React.CSSProperties;
      }, HTMLElement>;
    }
  }
}

interface SceneComposerProps {
  /**
   * URL of the 3D model (GLB/GLTF)
   */
  modelUrl?: string;
  
  /**
   * Current scale value
   */
  scale: number;
  
  /**
   * Current rotation [heading, pitch, roll] in degrees
   */
  rotation: [number, number, number];
  
  /**
   * Callback when scale changes
   */
  onScaleChange: (scale: number) => void;
  
  /**
   * Callback when rotation changes
   */
  onRotationChange: (rotation: [number, number, number]) => void;
  
  /**
   * Height of the preview area
   */
  height?: string;
  
  /**
   * Show advanced controls
   */
  showAdvanced?: boolean;
}

// Load model-viewer script dynamically
const loadModelViewer = () => {
  if (typeof window !== 'undefined' && !customElements.get('model-viewer')) {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js';
    document.head.appendChild(script);
  }
};

export const SceneComposer: React.FC<SceneComposerProps> = ({
  modelUrl,
  scale,
  rotation,
  onScaleChange,
  onRotationChange,
  height = '300px',
  showAdvanced = false,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const modelViewerRef = useRef<HTMLElement>(null);

  // Load model-viewer on mount
  useEffect(() => {
    loadModelViewer();
    
    // Wait for script to load
    const checkLoaded = setInterval(() => {
      if (customElements.get('model-viewer')) {
        setIsLoaded(true);
        clearInterval(checkLoaded);
      }
    }, 100);
    
    return () => clearInterval(checkLoaded);
  }, []);

  // Scale controls
  const handleScaleChange = (delta: number) => {
    const newScale = Math.max(0.1, Math.min(10, scale + delta));
    onScaleChange(Math.round(newScale * 100) / 100);
  };

  // Rotation controls (in degrees)
  const handleRotationChange = (axis: 0 | 1 | 2, delta: number) => {
    const newRotation: [number, number, number] = [...rotation];
    newRotation[axis] = (newRotation[axis] + delta) % 360;
    if (newRotation[axis] < 0) newRotation[axis] += 360;
    onRotationChange(newRotation);
  };

  // Reset to defaults
  const resetTransform = () => {
    onScaleChange(1.0);
    onRotationChange([0, 0, 0]);
  };

  // Calculate camera orbit from rotation
  const getCameraOrbit = () => {
    // Convert rotation to camera orbit angle
    const theta = rotation[0]; // heading
    const phi = 75; // fixed elevation
    const radius = '105%'; // distance
    return `${theta}deg ${phi}deg ${radius}`;
  };

  if (!modelUrl) {
    return (
      <div 
        className="bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center text-gray-500 p-4">
          <Move className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          <p className="font-medium">Sin modelo 3D</p>
          <p className="text-sm">Sube un archivo GLB para ver la preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Vista Previa 3D
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded transition ${
              autoRotate ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}
            title={autoRotate ? 'Detener rotación' : 'Auto-rotar'}
          >
            <RefreshCw className={`w-4 h-4 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          </button>
          <button
            type="button"
            onClick={() => setShowControls(!showControls)}
            className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
            title={showControls ? 'Ocultar controles' : 'Mostrar controles'}
          >
            {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 3D Preview Area */}
      <div 
        className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden"
        style={{ height }}
      >
        {isLoaded ? (
          <model-viewer
            ref={modelViewerRef as any}
            src={modelUrl}
            alt="Vista previa del modelo 3D"
            camera-controls
            auto-rotate={autoRotate}
            shadow-intensity="1"
            shadow-softness="0.5"
            exposure="0.8"
            camera-orbit={getCameraOrbit()}
            loading="eager"
            style={{
              width: '100%',
              height: '100%',
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Cargando visor 3D...</p>
            </div>
          </div>
        )}

        {/* Quick scale indicator */}
        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
          Escala: {scale.toFixed(2)}x
        </div>

        {/* Rotation indicator */}
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
          Rotación: {rotation[0]}°
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
          {/* Scale Control */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Escala
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleScaleChange(-0.1)}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <div className="flex-1">
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={scale}
                  onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              
              <button
                type="button"
                onClick={() => handleScaleChange(0.1)}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              
              <span className="w-16 text-center text-sm font-mono bg-white border border-gray-300 rounded px-2 py-1">
                {scale.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Rotation Control */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Rotación (Heading)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleRotationChange(0, -15)}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={rotation[0]}
                  onChange={(e) => onRotationChange([parseFloat(e.target.value), rotation[1], rotation[2]])}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              
              <button
                type="button"
                onClick={() => handleRotationChange(0, 15)}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <span className="w-16 text-center text-sm font-mono bg-white border border-gray-300 rounded px-2 py-1">
                {rotation[0]}°
              </span>
            </div>
          </div>

          {/* Advanced controls (pitch, roll) */}
          {showAdvanced && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Inclinación (Pitch)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRotationChange(1, -15)}
                    className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  
                  <div className="flex-1">
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="15"
                      value={rotation[1]}
                      onChange={(e) => onRotationChange([rotation[0], parseFloat(e.target.value), rotation[2]])}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handleRotationChange(1, 15)}
                    className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  
                  <span className="w-16 text-center text-sm font-mono bg-white border border-gray-300 rounded px-2 py-1">
                    {rotation[1]}°
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Alabeo (Roll)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRotationChange(2, -15)}
                    className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  >
                    <RotateCw className="w-4 h-4 -scale-x-100" />
                  </button>
                  
                  <div className="flex-1">
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="15"
                      value={rotation[2]}
                      onChange={(e) => onRotationChange([rotation[0], rotation[1], parseFloat(e.target.value)])}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handleRotationChange(2, 15)}
                    className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  
                  <span className="w-16 text-center text-sm font-mono bg-white border border-gray-300 rounded px-2 py-1">
                    {rotation[2]}°
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Reset button */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={resetTransform}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" />
              Restablecer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SceneComposer;

