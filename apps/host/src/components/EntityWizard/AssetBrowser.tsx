import React, { useState } from 'react';
import { Package, Upload, Check, Search } from 'lucide-react';
import { Model3DUploader } from './Model3DUploader';
import api from '@/services/api';
// defaultAssets removed in favor of API


interface AssetBrowserProps {
    onSelect: (url: string) => void;
    selectedUrl?: string;
    onScaleChange?: (scale: number) => void;
    scale?: number;
    onRotationChange?: (rotation: [number, number, number]) => void;
    rotation?: [number, number, number];
}

type Tab = 'library' | 'upload';

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
    onSelect,
    selectedUrl,
    onScaleChange,
    scale = 1.0,
    onRotationChange,
    rotation = [0, 0, 0]
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('library');
    const [searchTerm, setSearchTerm] = useState('');

    const [_selectedCategory, _setSelectedCategory] = useState<string>('all');
    const [publicAssets, setPublicAssets] = useState<any[]>([]);
    const [_loading, setLoading] = useState(false);

    React.useEffect(() => {
        const fetchAssets = async () => {
            try {
                setLoading(true);
                const response = await api.get('/api/assets/public');
                const apiAssets = response.data.assets || [];

                // Transform to expect format
                const models = apiAssets
                    .filter((a: any) => a.type === 'model')
                    .map((a: any) => ({
                        key: a.key,
                        url: a.url,
                        thumbnail: '/assets/icons/default-model.png', // Fallback or fetch icon
                        name: a.filename,
                        category: 'Public Library' // Simplification for now
                    }));
                setPublicAssets(models);
            } catch (err) {
                console.error("Failed to load public assets:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAssets();
    }, []);

    const filteredAssets = publicAssets.filter(asset =>
        asset.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.key?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('library')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'library'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Librería Pública
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('upload')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'upload'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Subir Modelo
                    </div>
                </button>
            </div>

            {/* Content */}
            <div className="min-h-[300px]">
                {activeTab === 'library' ? (
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Buscar activos (olivo, tractor...)"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto p-1">
                            {filteredAssets.map((asset) => (
                                <button
                                    key={asset.key}
                                    onClick={() => onSelect(asset.url)}
                                    className={`group relative border-2 rounded-xl text-left transition-all hover:shadow-md flex flex-col overflow-hidden h-[220px] ${selectedUrl === asset.url
                                        ? 'border-blue-500 ring-2 ring-blue-200'
                                        : 'border-gray-200 hover:border-blue-300'
                                        }`}
                                >
                                    {/* 3D Preview */}
                                    <div className="flex-1 w-full bg-gray-50 relative">
                                        {/* @ts-ignore */}
                                        <model-viewer
                                            src={asset.url}
                                            poster="/assets/icons/default-model.png"
                                            alt={asset.name}
                                            auto-rotate
                                            camera-controls
                                            disable-zoom
                                            disable-pan
                                            shadow-intensity="1"
                                            background-color="#f9fafb"
                                            style={{ width: '100%', height: '100%' }}
                                        >
                                            <div slot="poster" className="flex items-center justify-center w-full h-full text-gray-400">
                                                <Package className="w-8 h-8 opacity-50" />
                                            </div>
                                            {/* @ts-ignore */}
                                        </model-viewer>

                                        {/* Selection Checkmark */}
                                        {selectedUrl === asset.url && (
                                            <div className="absolute top-2 right-2 z-10 p-1.5 bg-blue-600 rounded-full text-white shadow-md">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Asset Info */}
                                    <div className="p-3 bg-white w-full border-t border-gray-100">
                                        <div className="font-medium text-sm text-gray-900 capitalize truncate" title={asset.key}>
                                            {asset.key.replace(/_/g, ' ').replace(/-/g, ' ').replace('.glb', '')}
                                        </div>
                                        <div className="text-xs text-gray-500 capitalize flex justify-between items-center mt-1">
                                            <span>{asset.category}</span>
                                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">GLB</span>
                                        </div>
                                    </div>
                                </button>
                            ))}

                            {filteredAssets.length === 0 && (
                                <div className="col-span-full py-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                    <p>No se encontraron activos</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="p-4">
                        <Model3DUploader
                            onUpload={(url) => {
                                onSelect(url);
                                // Optionally switch back to library or show success
                            }}
                            onScaleChange={(s) => onScaleChange?.(s)}
                            onRotationChange={(r) => onRotationChange?.(r)}
                            modelScale={scale}
                            modelRotation={rotation}
                        />
                    </div>
                )}
            </div>

            {/* Scale & Rotation Controls (Shared for Library Selection) */}
            {activeTab === 'library' && selectedUrl && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                    {/* Scale */}
                    {onScaleChange && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Escala del Modelo: {scale.toFixed(1)}x
                            </label>
                            <input
                                type="range"
                                min="0.1"
                                max="10.0"
                                step="0.1"
                                value={scale}
                                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>0.1x</span>
                                <span>1.0x</span>
                                <span>10.0x</span>
                            </div>
                        </div>
                    )}

                    {/* Rotation */}
                    {onRotationChange && rotation && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Rotación (X, Y, Z)
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {['X', 'Y', 'Z'].map((axis, i) => (
                                    <div key={axis}>
                                        <label className="text-xs text-gray-500 block mb-1">{axis}: {rotation[i]}°</label>
                                        <input
                                            type="number"
                                            value={rotation[i]}
                                            onChange={(e) => {
                                                const newRot = [...rotation] as [number, number, number];
                                                newRot[i] = parseFloat(e.target.value) || 0;
                                                onRotationChange(newRot);
                                            }}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
