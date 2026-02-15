import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Package, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { NekazariClient } from '@nekazari/sdk';
import { useAuth } from '@/context/KeycloakAuthContext';
import { getConfig } from '@/config/environment';
import { Card } from '@nekazari/ui-kit';
import { Button } from '@nekazari/ui-kit';

const config = getConfig();
const API_BASE_URL = config.api.baseUrl || '/api';

interface ModuleUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface UploadStatus {
  status: 'idle' | 'uploading' | 'validating' | 'completed' | 'error';
  message?: string;
  uploadId?: string;
  moduleId?: string;
  version?: string;
}

interface ValidationLogs {
  logs: string[];
  job_name?: string;
  pod_name?: string;
}

export const ModuleUploadModal: React.FC<ModuleUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { getToken, tenantId } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll logs when validating
  useEffect(() => {
    if (uploadStatus.status === 'validating' && uploadStatus.uploadId) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/modules/${uploadStatus.uploadId}/logs`, {
            headers: {
              'Authorization': `Bearer ${await getToken()}`,
            },
          });

          if (response.ok) {
            const data: ValidationLogs = await response.json();
            if (data.logs && data.logs.length > 0) {
              setLogs(data.logs);
            }
          }
        } catch (err) {
          // Silently fail, logs are optional
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [uploadStatus.status, uploadStatus.uploadId, getToken]);

  if (!isOpen) return null;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadStatus({ status: 'idle' });

    // Validate file extension
    if (!file.name.toLowerCase().endswith('.zip')) {
      setError('Only ZIP files are allowed');
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      setError(`File size exceeds maximum of ${(maxSize / (1024 * 1024)).toFixed(0)}MB`);
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !getToken) return;

    setError(null);
    setUploadStatus({ status: 'uploading', message: 'Uploading module...' });

    try {
      const client = new NekazariClient({
        baseUrl: API_BASE_URL,
        getToken: getToken,
        getTenantId: () => tenantId,
      });

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Upload module
      const response = await fetch(`${API_BASE_URL}/modules/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getToken()}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      setUploadStatus({
        status: 'validating',
        message: 'Module uploaded successfully. Validation in progress...',
        uploadId: data.upload_id,
        moduleId: data.module_id,
        version: data.version,
      });

      // Call onSuccess callback after a short delay to show success message
      setTimeout(() => {
        setUploadStatus({ status: 'completed', message: 'Upload completed successfully' });
        if (onSuccess) {
          onSuccess();
        }
      }, 2000);

    } catch (err: any) {
      const errorMessage = err.message || 'Failed to upload module';
      setError(errorMessage);
      setUploadStatus({ status: 'error', message: errorMessage });
    }
  };

  const handleClose = () => {
    if (uploadStatus.status === 'uploading' || uploadStatus.status === 'validating') {
      // Don't close while uploading/validating
      return;
    }
    
    // Reset state
    setSelectedFile(null);
    setError(null);
    setUploadStatus({ status: 'idle' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Upload Module</h2>
              <p className="text-sm text-gray-500">Upload a ZIP file containing your module</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={uploadStatus.status === 'uploading' || uploadStatus.status === 'validating'}
            className="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* File Selection */}
          {uploadStatus.status === 'idle' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Module ZIP File
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="module-file-input"
                  />
                  <label
                    htmlFor="module-file-input"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="w-12 h-12 text-gray-400 mb-3" />
                    <span className="text-sm font-medium text-gray-700">
                      {selectedFile ? selectedFile.name : 'Click to select ZIP file'}
                    </span>
                    {selectedFile && (
                      <span className="text-xs text-gray-500 mt-1">
                        {formatFileSize(selectedFile.size)}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 mt-2">
                      Maximum file size: 50MB
                    </span>
                  </label>
                </div>
              </div>

              {/* Requirements */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  Module Requirements
                </h3>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li>ZIP file must contain a <code className="bg-blue-100 px-1 rounded">manifest.json</code> file</li>
                  <li>ZIP file must contain <code className="bg-blue-100 px-1 rounded">src/App.tsx</code> or <code className="bg-blue-100 px-1 rounded">src/App.jsx</code></li>
                  <li>Manifest must follow the required schema (see documentation)</li>
                  <li>Module will be validated before being added to the marketplace</li>
                </ul>
              </div>
            </div>
          )}

          {/* Upload Status */}
          {(uploadStatus.status === 'uploading' || uploadStatus.status === 'validating') && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    {uploadStatus.status === 'uploading' ? 'Uploading...' : 'Validating...'}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    {uploadStatus.message}
                  </p>
                </div>
              </div>
              
              {uploadStatus.moduleId && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Module ID:</span>
                      <span className="ml-2 font-mono text-gray-900">{uploadStatus.moduleId}</span>
                    </div>
                    {uploadStatus.version && (
                      <div>
                        <span className="text-gray-500">Version:</span>
                        <span className="ml-2 font-mono text-gray-900">{uploadStatus.version}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Validation Logs */}
              {uploadStatus.status === 'validating' && uploadStatus.uploadId && (
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-t-lg flex items-center justify-between"
                  >
                    <span>Validation Logs {logs.length > 0 && `(${logs.length} lines)`}</span>
                    <span className="text-xs">{showLogs ? '▼' : '▶'}</span>
                  </button>
                  {showLogs && (
                    <div className="p-4 bg-gray-900 text-green-400 font-mono text-xs max-h-64 overflow-y-auto">
                      {logs.length > 0 ? (
                        logs.map((log, idx) => (
                          <div key={idx} className="mb-1">
                            {log || ' '}
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-500">Waiting for logs...</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Success Status */}
          {uploadStatus.status === 'completed' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">
                    Module uploaded successfully!
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Validation is in progress. The module will be available in the marketplace once validated.
                  </p>
                </div>
              </div>
              {uploadStatus.moduleId && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Module ID:</span>
                      <span className="ml-2 font-mono text-gray-900">{uploadStatus.moduleId}</span>
                    </div>
                    {uploadStatus.version && (
                      <div>
                        <span className="text-gray-500">Version:</span>
                        <span className="ml-2 font-mono text-gray-900">{uploadStatus.version}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Upload Failed</p>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={uploadStatus.status === 'uploading' || uploadStatus.status === 'validating'}
            >
              {uploadStatus.status === 'completed' ? 'Close' : 'Cancel'}
            </Button>
            {uploadStatus.status === 'idle' && selectedFile && (
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={!selectedFile}
              >
                Upload Module
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};























