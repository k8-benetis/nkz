import React, { useState, useEffect } from 'react';
import { Upload, Trash2, FileIcon, Box, Loader2, AlertCircle, CheckCircle, Globe, Building2 } from 'lucide-react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';

interface Asset {
    key: string;
    id?: string;
    url: string;
    type: string;
    filename: string;
    name?: string;
    size: number;
    last_modified: string;
    asset_id?: string;
    asset_type?: string;
    extension?: string;
}

type AssetTab = 'public' | 'tenant';

function inferType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['glb', 'gltf'].includes(ext || '') ? 'model' : 'icon';
}

function normalizePublicAsset(raw: { id: string; name: string; url: string; size: number; last_modified: string }): Asset {
    return {
        key: raw.id,
        url: raw.url,
        type: inferType(raw.name),
        filename: raw.name,
        size: raw.size,
        last_modified: raw.last_modified,
    };
}

function normalizeTenantAsset(raw: {
    id: string; key: string; name: string; url: string; size: number; last_modified: string;
    asset_id?: string; asset_type?: string; extension?: string;
}): Asset {
    return {
        key: raw.key || raw.id,
        id: raw.id,
        url: raw.url,
        type: raw.asset_type || inferType(raw.name),
        filename: raw.name,
        size: raw.size,
        last_modified: raw.last_modified,
        asset_id: raw.asset_id,
        asset_type: raw.asset_type,
        extension: raw.extension,
    };
}

export const GlobalAssetManager: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<AssetTab>('public');
    const [assets, setAssets] = useState<Asset[]>([]);
    const [tenantAssets, setTenantAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [tenantLoading, setTenantLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const isPlatformAdmin = user?.roles?.includes('PlatformAdmin');
    const tenantId = user?.tenant;
    const canManageTenant = Boolean(tenantId);

    const loadPublicAssets = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/api/assets/public');
            const list = (response.data.assets || []).map(normalizePublicAsset);
            setAssets(list);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to load public assets.');
        } finally {
            setLoading(false);
        }
    };

    const loadTenantAssets = async () => {
        try {
            setTenantLoading(true);
            setError(null);
            const response = await api.get('/api/assets/tenant');
            const list = (response.data.assets || []).map(normalizeTenantAsset);
            setTenantAssets(list);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to load tenant assets.');
        } finally {
            setTenantLoading(false);
        }
    };

    useEffect(() => {
        loadPublicAssets();
    }, []);

    useEffect(() => {
        if (activeTab === 'tenant' && canManageTenant) {
            loadTenantAssets();
        }
    }, [activeTab, canManageTenant]);

    const loadAssets = () => {
        if (activeTab === 'public') loadPublicAssets();
        else loadTenantAssets();
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.[0]) await handleUpload(e.dataTransfer.files[0]);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) await handleUpload(e.target.files[0]);
    };

    const handleUpload = async (file: File) => {
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
            if (activeTab === 'public') {
                if (!isPlatformAdmin) {
                    setError('Only Platform Admins can upload global assets.');
                    return;
                }
                await api.post('/api/assets/public', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                setSuccess(`Successfully uploaded ${file.name} to public library.`);
                loadPublicAssets();
            } else {
                if (!canManageTenant) {
                    setError('You need a tenant to upload tenant assets.');
                    return;
                }
                await api.uploadAsset(formData);
                setSuccess(`Successfully uploaded ${file.name} to your tenant.`);
                loadTenantAssets();
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to upload asset.');
        } finally {
            setUploading(false);
        }
    };

    const handleDeletePublic = async (key: string) => {
        if (!confirm('Are you sure you want to delete this public asset? This might affect users currently using it.')) return;
        try {
            await api.delete(`/api/assets/public/${key}`);
            setSuccess('Asset deleted successfully.');
            loadPublicAssets();
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to delete asset.');
        }
    };

    const handleDeleteTenant = async (asset: Asset) => {
        if (!confirm('Are you sure you want to delete this tenant asset?')) return;
        const assetId = asset.asset_id ?? asset.key.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
        const type = asset.asset_type || 'model';
        const extension = asset.extension || (asset.filename.endsWith('.gltf') ? '.gltf' : '.glb');
        try {
            await api.delete(`/api/assets/${assetId}?type=${type}&extension=${encodeURIComponent(extension)}`);
            setSuccess('Tenant asset deleted successfully.');
            loadTenantAssets();
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to delete asset.');
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const currentAssets = activeTab === 'public' ? assets : tenantAssets;
    const isLoading = activeTab === 'public' ? loading : tenantLoading;
    const showUpload = activeTab === 'public' ? isPlatformAdmin : canManageTenant;

    if (!isPlatformAdmin && !canManageTenant) {
        return (
            <div className="p-6 text-center text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>You do not have permission to manage assets.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">Asset Library</h2>
                        <p className="text-sm text-gray-500">
                            {activeTab === 'public' ? 'Public models and icons (all tenants).' : 'Your tenant’s models and icons.'}
                        </p>
                    </div>
                    <button
                        onClick={loadAssets}
                        disabled={isLoading}
                        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                        title="Refresh"
                    >
                        <Loader2 className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-4">
                    <button
                        onClick={() => { setActiveTab('public'); setError(null); setSuccess(null); }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'public' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Globe className="w-4 h-4" />
                        Public
                    </button>
                    {canManageTenant && (
                        <button
                            onClick={() => { setActiveTab('tenant'); setError(null); setSuccess(null); }}
                            className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'tenant' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Building2 className="w-4 h-4" />
                            My tenant models
                        </button>
                    )}
                </div>

                {/* Upload Area */}
                {showUpload && (
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'} ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
                                    <p className="text-sm text-gray-600 font-medium">Drag and drop or click to browse</p>
                                    <p className="text-xs text-gray-500 mt-1">.glb, .gltf (models) and .png, .jpg (icons)</p>
                                </div>
                            )}
                        </label>
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        {success}
                    </div>
                )}
            </div>

            {/* Asset List */}
            <div className="p-0">
                {currentAssets.length === 0 && !isLoading ? (
                    <div className="p-8 text-center text-gray-500">
                        <Box className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>{activeTab === 'public' ? 'No public assets found.' : 'No tenant assets yet. Upload models or icons above.'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {currentAssets.map((asset) => (
                            <div key={asset.key} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                                        {asset.type === 'model' ? <Box className="w-6 h-6" /> : <FileIcon className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">{asset.filename || asset.name}</h4>
                                        <div className="flex gap-4 text-xs text-gray-500">
                                            <span>{formatSize(asset.size)}</span>
                                            <span>{new Date(asset.last_modified).toLocaleDateString()}</span>
                                            <span className="uppercase bg-gray-200 px-1.5 rounded text-[10px] font-bold tracking-wider pt-0.5">{asset.type}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {asset.type === 'model' && (
                                        <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm mr-2">
                                            Download
                                        </a>
                                    )}
                                    <button
                                        onClick={() => activeTab === 'public' ? handleDeletePublic(asset.key) : handleDeleteTenant(asset)}
                                        className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                                        title="Delete"
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
