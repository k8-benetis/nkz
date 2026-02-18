import React, { useState, useRef } from 'react';
import { Upload, X, Check, Loader2 } from 'lucide-react';
import { uploadToMinIO, isValid3DModelFile, getMaxFileSizeMB, UploadProgress } from '@/utils/minioAssets';

interface Model3DUploaderProps {
  currentModelUrl?: string;
  modelScale?: number;
  modelRotation?: [number, number, number];
  onUpload: (url: string) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: [number, number, number]) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export const Model3DUploader: React.FC<Model3DUploaderProps> = ({
  currentModelUrl,
  modelScale = 1.0,
  modelRotation = [0, 0, 0],
  onUpload,
  onScaleChange,
  onRotationChange,
  onRemove,
  disabled = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadProgress(0);

    // Validate file type
    if (!isValid3DModelFile(file)) {
      setError('Invalid file type. Please upload GLB or GLTF.');
      return;
    }

    // Validate file size
    const maxSizeMB = getMaxFileSizeMB('model');
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      setError(`File too large. Maximum size is ${maxSizeMB}MB.`);
      return;
    }

    // Upload to MinIO
    setUploading(true);
    try {
      const url = await uploadToMinIO(file, 'model', {
        onProgress: (progress: UploadProgress) => {
          setUploadProgress(progress.percentage);
        }
      });
      onUpload(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload 3D model');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        3D Model (Optional)
      </label>

      <div className="space-y-4">
        {/* Upload */}
        <div className="flex items-center gap-2">
          <label
            className={`flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition ${
              disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {uploading ? `Uploading... ${uploadProgress}%` : 'Upload 3D Model'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              onChange={handleFileSelect}
              disabled={disabled || uploading}
              className="hidden"
            />
          </label>

          {currentModelUrl && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Upload Progress Bar */}
        {uploading && uploadProgress > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        <p className="text-xs text-gray-500">
          Formats: GLB, GLTF. Max size: {getMaxFileSizeMB('model')}MB
        </p>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </div>
        )}

        {currentModelUrl && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3 h-3" />
            <span>3D model uploaded successfully</span>
          </div>
        )}

        {/* Scale and Rotation controls */}
        {currentModelUrl && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Scale: {modelScale.toFixed(2)}x
              </label>
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={modelScale}
                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                disabled={disabled}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.1x</span>
                <span>5.0x</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Rotation (degrees)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">X</label>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={modelRotation[0]}
                    onChange={(e) => onRotationChange([
                      parseInt(e.target.value) || 0,
                      modelRotation[1],
                      modelRotation[2]
                    ])}
                    disabled={disabled}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Y</label>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={modelRotation[1]}
                    onChange={(e) => onRotationChange([
                      modelRotation[0],
                      parseInt(e.target.value) || 0,
                      modelRotation[2]
                    ])}
                    disabled={disabled}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Z</label>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={modelRotation[2]}
                    onChange={(e) => onRotationChange([
                      modelRotation[0],
                      modelRotation[1],
                      parseInt(e.target.value) || 0
                    ])}
                    disabled={disabled}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
