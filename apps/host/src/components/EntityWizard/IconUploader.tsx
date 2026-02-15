import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Check, Loader2 } from 'lucide-react';
import { uploadToMinIO, isValidIconFile, formatFileSize, getMaxFileSizeMB, UploadProgress } from '@/utils/minioAssets';

interface IconUploaderProps {
  currentIconUrl?: string;
  defaultIconPath?: string;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export const IconUploader: React.FC<IconUploaderProps> = ({
  currentIconUrl,
  defaultIconPath,
  onUpload,
  onRemove,
  disabled = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentIconUrl || defaultIconPath || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadProgress(0);

    // Validate file type
    if (!isValidIconFile(file)) {
      setError('Invalid file type. Please upload PNG, JPG, SVG, or WebP.');
      return;
    }

    // Validate file size
    const maxSizeMB = getMaxFileSizeMB('icon');
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      setError(`File too large. Maximum size is ${maxSizeMB}MB.`);
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to MinIO
    setUploading(true);
    try {
      const url = await uploadToMinIO(file, 'icon', {
        onProgress: (progress: UploadProgress) => {
          setUploadProgress(progress.percentage);
        }
      });
      onUpload(url);
      setPreview(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload icon');
      setPreview(null);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setPreview(defaultIconPath || null);
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
        Icon (2D)
      </label>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="flex-shrink-0">
          <div className="w-24 h-24 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
            {preview ? (
              <img
                src={preview}
                alt="Icon preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-400" />
            )}
          </div>
        </div>

        {/* Upload controls */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
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
                {uploading ? `Uploading... ${uploadProgress}%` : 'Upload Icon'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                onChange={handleFileSelect}
                disabled={disabled || uploading}
                className="hidden"
              />
            </label>

            {preview && preview !== defaultIconPath && !uploading && (
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
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <p className="text-xs text-gray-500">
            Formats: PNG, JPG, SVG, WebP. Max size: {getMaxFileSizeMB('icon')}MB
          </p>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {error}
            </div>
          )}

          {currentIconUrl && currentIconUrl !== preview && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3 h-3" />
              <span>Icon uploaded successfully</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
