import React, { useState, useEffect } from 'react';
import { Upload, Trash2, FileIcon, Box, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';

interface Asset {
    key: string;
    url: string;
    type: string;
    filename: string;
    size: number;
    last_modified: string;
}

export const GlobalAssetManager: React.FC = () => {
    const { user } = useAuth();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const isPlatformAdmin = user?.roles?.includes('PlatformAdmin');

    useEffect(() => {
        loadAssets();
    }, []);

    const loadAssets = async () => {
        try {
            setLoading(true);
            setError(null);
            // Use direct axios call if api wrapper doesn't have a specific method yet
            // Assuming api.get handles auth headers
            const response = await api.get('/api/assets/public');
            setAssets(response.data.assets || []);
        } catch (err) {
            console.error('Failed to load assets:', err);
            setError('Failed to load public assets.');
        } finally {
            setLoading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await handleUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            await handleUpload(e.target.files[0]);
        }
    };

    const handleUpload = async (file: File) => {
        if (!isPlatformAdmin) {
            setError('Only Platform Admins can upload global assets.');
            return;
        }

        // Determine asset type from extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        let assetType = 'model';
        if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) {
            assetType = 'icon';
        } else if (!['glb', 'gltf'].includes(ext || '')) {
            setError('Unsupported file type. Please upload .glb, .gltf, .png, .jpg, or .svg.');
            return;
        }

        setUploading(true);
        setError(null);
        setSuccess(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('asset_type', assetType);

        try {
            // Direct POST to the new endpoint
            // Note: api.post arguments might vary depending on implementation (url, data, config)
            await api.post('/api/assets/public', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            setSuccess(`Successfully uploaded ${file.name}`);
            loadAssets(); // Refresh list
        } catch (err: any) {
            console.error('Upload failed:', err);
            setError(err.response?.data?.error || 'Failed to upload asset.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (key: string) => {
        if (!confirm('Are you sure you want to delete this public asset? This might affect users currently using it.')) {
            return;
        }

        try {
            // Construct path from key. The API expects the full key/path.
            // We pass it as URL param, encoded properly.
            // The API route is /api/assets/public/<path:filename>, so we match that.
            // If key is 'public/model/tree.glb', we send 'public/model/tree.glb'
            // encodeURIComponent might be needed for slashes, but Flask <path:> handles slashes.
            // Let's try passing it directly to api.delete

            await api.delete(`/api/assets/public/${key}`);
            setSuccess('Asset deleted successfully');
            loadAssets();
        } catch (err: any) {
            console.error('Delete failed:', err);
            setError(err.response?.data?.error || 'Failed to delete asset');
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (!isPlatformAdmin) {
        return (
            <div className="p-6 text-center text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>You do not have permission to manage global assets.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">Global Asset Library</h2>
                        <p className="text-sm text-gray-500">Manage public 3D models and icons available to all tenants.</p>
                    </div>
                    <button
                        onClick={loadAssets}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                        title="Refresh"
                    >
                        <Loader2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Upload Area */}
                <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                        } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        id="file-upload"
                        className="hidden"
                        onChange={handleFileSelect}
                        accept=".glb,.gltf,.png,.jpg,.jpeg,.svg,.webp"
                        disabled={uploading}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer block">
                        {uploading ? (
                            <div className="flex flex-col items-center">
                                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" />
                                <p className="text-sm text-blue-600 font-medium">Uploading...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <Upload className="w-10 h-10 text-gray-400 mb-2" />
                                <p className="text-sm text-gray-600 font-medium">
                                    Drag and drop your file here, or click to browse
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Supports .glb, .gltf (Models) and .png, .jpg (Icons)
                                </p>
                            </div>
                        )}
                    </label>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                {success && (
                    <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        {success}
                    </div>
                )}
            </div>

            {/* Asset List */}
            <div className="p-0">
                {assets.length === 0 && !loading ? (
                    <div className="p-8 text-center text-gray-500">
                        <Box className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No public assets found.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {assets.map((asset) => (
                            <div key={asset.key} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                                        {asset.type === 'model' ? <Box className="w-6 h-6" /> : <FileIcon className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">{asset.filename}</h4>
                                        <div className="flex gap-4 text-xs text-gray-500">
                                            <span>{formatSize(asset.size)}</span>
                                            <span>{new Date(asset.last_modified).toLocaleDateString()}</span>
                                            <span className="uppercase bg-gray-200 px-1.5 rounded text-[10px] font-bold tracking-wider pt-0.5">{asset.type}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {asset.type === 'model' && (
                                        <a
                                            href={asset.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 text-sm mr-2"
                                        >
                                            Download
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handleDelete(asset.key)}
                                        className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                                        title="Delete Asset"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
