// =============================================================================
// ConnectivityPanel - IoT Device Connectivity Configuration
// =============================================================================
// Full panel for managing device profiles and data mapping configuration
// + Connection Details and Credential Management

import React, { useState, useEffect, useCallback } from 'react';
import {
    BookmarkPlus,
    RefreshCw,
    ChevronDown,
    Check,
    AlertCircle,
    FileCode,
    Wifi,
    Key,
    Download,
    TriangleAlert,
    Copy,
    Server,
    ShieldCheck
} from 'lucide-react';
import {
    DeviceProfile,
    listDeviceProfiles,
    createDeviceProfile,
    listSDMSchemas,
    SDMSchema,
    MappingEntry
} from '@/services/deviceProfilesApi';
import api from '@/services/api';
import { MappingEditor } from './MappingEditor';

// =============================================================================
// Types
// =============================================================================

interface ConnectivityPanelProps {
    entityId: string;
    entityType: string;
    entityName: string;
    currentProfileId?: string | null;
    onProfileChange?: (profileId: string | null) => void;
    readonly?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const ConnectivityPanel: React.FC<ConnectivityPanelProps> = ({
    entityId,
    entityType,
    entityName,
    currentProfileId,
    onProfileChange,
    readonly = false
}) => {
    // Profile State
    const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
    const [_schemas, setSchemas] = useState<SDMSchema[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(currentProfileId || null);
    const [customMappings, setCustomMappings] = useState<MappingEntry[]>([]);
    const [mode, setMode] = useState<'profile' | 'custom'>('profile');

    // Connection State
    const [iotDetails, setIotDetails] = useState<any>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
    const [newlyRegeneratedKey, setNewlyRegeneratedKey] = useState<string | null>(null);

    // UI State
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [saveAsProfileName, setSaveAsProfileName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [activeTab, setActiveTab] = useState<'status' | 'profile'>('status');

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Load Profiles
            const [fetchedProfiles, fetchedSchemas] = await Promise.all([
                listDeviceProfiles({ sdm_entity_type: entityType }),
                listSDMSchemas()
            ]);
            setProfiles(fetchedProfiles);
            setSchemas(fetchedSchemas);

            // Load IoT Details if applicable
            try {
                if (['AgriSensor', 'Sensor', 'Device', 'WeatherStation', 'AgriculturalTractor', 'LivestockAnimal'].includes(entityType)) {
                    const details = await api.getIoTDetails(entityId);
                    setIotDetails(details);
                }
            } catch (e) {
                console.warn("Could not load IoT details (maybe not provisioned yet)", e);
            }

            // Sync current profile
            if (currentProfileId) {
                const profile = fetchedProfiles.find(p => p.id === currentProfileId);
                if (profile) {
                    setCustomMappings(profile.mappings);
                    setSelectedProfileId(currentProfileId);
                }
            }
        } catch (err) {
            setError('Error cargando datos de conectividad');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [entityType, currentProfileId, entityId]);

    useEffect(() => {
        loadData();
    }, [loadData]);


    // =========================================================================
    // Handlers
    // =========================================================================

    const handleProfileSelect = async (profileId: string | null) => {
        setSelectedProfileId(profileId);
        if (profileId) {
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                setCustomMappings(profile.mappings);
                setMode('profile');
            }
        } else {
            setCustomMappings([]);
        }
        onProfileChange?.(profileId);
    };

    const handleRegenerateKey = async () => {
        setRegenerating(true);
        setError(null);
        try {
            const result = await api.regenerateIoTKey(entityId);
            setNewlyRegeneratedKey(result.api_key);
            setIotDetails({ ...iotDetails, ...result.mqtt }); // Update details with new info
            setSuccess('Nueva API Key generada. Copiala ahora, no podrás verla después.');
            setShowRegenerateConfirm(false);
        } catch (err: any) {
            setError('Error regenerando clave: ' + (err.message || 'Error del servidor'));
        } finally {
            setRegenerating(false);
        }
    };

    const handleSaveAsProfile = async () => {
        if (!saveAsProfileName.trim()) return;
        setSaving(true);
        try {
            const result = await createDeviceProfile({
                name: saveAsProfileName.trim(),
                description: `Perfil creado desde ${entityName}`,
                sdm_entity_type: entityType,
                mappings: customMappings,
                is_public: false
            });
            setSuccess('Perfil guardado correctamente');
            setShowSaveDialog(false);
            setSaveAsProfileName('');
            loadData();
            setSelectedProfileId(result.id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setSuccess('Copiado al portapapeles');
        setTimeout(() => setSuccess(null), 2000);
    };

    // Group profiles
    const globalProfiles = profiles.filter(p => p.is_public);
    const privateProfiles = profiles.filter(p => !p.is_public);

    // AgriculturalRobot uses VPN. AgriculturalTractor uses IoT (ISOBUS bridge usually speaks MQTT).
    const showVpnSection = entityType === 'AgriculturalRobot';

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header / Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-700 pb-2 mb-2">
                <button
                    onClick={() => setActiveTab('status')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'status'
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                >
                    <Wifi className="w-4 h-4" />
                    Estado y Credenciales
                </button>
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'profile'
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                >
                    <FileCode className="w-4 h-4" />
                    Perfil de Datos
                </button>
            </div>

            {/* Notifications */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <Check className="w-4 h-4 text-green-400" />
                    <p className="text-sm text-green-300">{success}</p>
                </div>
            )}

            {/* TAB: STATUS */}
            {activeTab === 'status' && (
                <div className="space-y-6 overflow-y-auto pr-2">

                    {/* ROBOT / VPN SECTION */}
                    {showVpnSection && (
                        <div className="bg-gray-800/50 rounded-xl p-5 border border-indigo-500/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-indigo-500/20 rounded-lg">
                                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                                </div>
                                <h3 className="text-lg font-medium text-white">Conexión Segura (VPN)</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-400 text-xs uppercase tracking-wider">Estado</span>
                                        <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            Configurado
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-xs uppercase tracking-wider">Tipo</span>
                                        <span className="text-indigo-300 text-sm">WireGuard</span>
                                    </div>
                                </div>
                                <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition">
                                    <Download className="w-4 h-4" />
                                    Descargar Configuración (.conf)
                                </button>
                                <p className="text-xs text-gray-500 text-center">
                                    Usa este archivo en <code>/etc/wireguard/</code> en el robot.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* IOT / MQTT SECTION */}
                    {!showVpnSection && iotDetails && (
                        <div className="bg-gray-800/50 rounded-xl p-5 border border-purple-500/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-500/20 rounded-lg">
                                    <Server className="w-5 h-5 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-white">Broker MQTT</h3>
                                    <p className="text-xs text-gray-400">Endpoint para envío de telemetría</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Connection Info */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                        <label className="block text-xs text-gray-500 mb-1">Host</label>
                                        <code className="text-sm text-purple-300">{iotDetails.mqtt_host}</code>
                                    </div>
                                    <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                        <label className="block text-xs text-gray-500 mb-1">Port</label>
                                        <code className="text-sm text-purple-300">{iotDetails.mqtt_port} ({iotDetails.protocol})</code>
                                    </div>
                                </div>

                                {/* Topic */}
                                <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                    <label className="block text-xs text-gray-500 mb-1">Topic de Publicación</label>
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-xs text-green-400 break-all">
                                            {newlyRegeneratedKey ? iotDetails.topics?.publish_data?.replace('<API_KEY>', newlyRegeneratedKey) : iotDetails.topics?.publish_data}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(newlyRegeneratedKey ? iotDetails.topics?.publish_data?.replace('<API_KEY>', newlyRegeneratedKey) : iotDetails.topics?.publish_data)}
                                            className="p-1 hover:bg-gray-700 rounded text-gray-400"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* API Key Section */}
                                <div className="pt-4 border-t border-gray-700">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                            <Key className="w-4 h-4 text-yellow-500" />
                                            API Key
                                        </h4>
                                        {!newlyRegeneratedKey && (
                                            <button
                                                onClick={() => setShowRegenerateConfirm(true)}
                                                className="text-xs text-red-400 hover:text-red-300 hover:underline"
                                            >
                                                Regenerar Clave
                                            </button>
                                        )}
                                    </div>

                                    {newlyRegeneratedKey ? (
                                        <div className="p-4 bg-green-900/20 border border-green-500/50 rounded-lg animate-in fade-in slide-in-from-top-2">
                                            <div className="flex justify-between items-start mb-2">
                                                <label className="text-xs font-bold text-green-400 uppercase">Nueva Clave Generada</label>
                                                <button onClick={() => copyToClipboard(newlyRegeneratedKey)} className="text-green-400 hover:text-green-300">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <code className="block text-lg font-mono text-white break-all mb-2">
                                                {newlyRegeneratedKey}
                                            </code>
                                            <p className="text-xs text-green-300/80">
                                                ⚠️ Guarda esta clave ahora. Por seguridad, no se volverá a mostrar completa.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700 flex items-center justify-between">
                                            <span className="text-gray-500 text-sm font-mono">••••••••••••••••</span>
                                            <span className="text-xs text-gray-600 italic">Oculta por seguridad</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* REGENERATE CONFIRM MODAL */}
                    {showRegenerateConfirm && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6 border border-gray-700 shadow-2xl">
                                <div className="flex flex-col items-center text-center gap-4">
                                    <div className="p-3 bg-red-500/20 rounded-full">
                                        <TriangleAlert className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">¿Regenerar API Key?</h3>
                                    <p className="text-sm text-gray-400">
                                        Esta acción invalidará la clave anterior. El dispositivo dejará de conectar hasta que lo actualices con la nueva clave.
                                    </p>
                                    <div className="flex gap-3 w-full mt-2">
                                        <button
                                            onClick={() => setShowRegenerateConfirm(false)}
                                            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleRegenerateKey}
                                            disabled={regenerating}
                                            className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                                        >
                                            {regenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Sí, regenerar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: PROFILE */}
            {activeTab === 'profile' && (
                <div className="space-y-6 overflow-y-auto pr-2">
                    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                        <label className="block text-sm text-gray-400 mb-2">
                            Perfil de Dispositivo
                        </label>
                        <div className="relative">
                            <select
                                value={selectedProfileId || ''}
                                onChange={(e) => handleProfileSelect(e.target.value || null)}
                                disabled={readonly || loading}
                                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white appearance-none pr-10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                            >
                                <option value="">-- Sin perfil (configuración manual) --</option>
                                {globalProfiles.length > 0 && (
                                    <optgroup label="🏛️ Perfiles Oficiales">
                                        {globalProfiles.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {privateProfiles.length > 0 && (
                                    <optgroup label="🏠 Mis Perfiles">
                                        {privateProfiles.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                        </div>

                        {/* Switch to Custom */}
                        {mode === 'profile' && selectedProfileId && !readonly && (
                            <button
                                onClick={() => setMode('custom')}
                                className="mt-3 text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                            >
                                <FileCode className="w-4 h-4" />
                                Personalizar mapeo...
                            </button>
                        )}
                    </div>

                    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                        <MappingEditor
                            mappings={customMappings}
                            sdmEntityType={entityType}
                            onChange={setCustomMappings}
                            readonly={readonly || (mode === 'profile' && !!selectedProfileId)}
                        />
                    </div>

                    {!readonly && mode === 'custom' && customMappings.length > 0 && (
                        <button
                            onClick={() => setShowSaveDialog(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                            <BookmarkPlus className="w-4 h-4" />
                            Guardar como Nuevo Perfil
                        </button>
                    )}
                </div>
            )}

            {/* Save Profile Dialog - Should be portalled or absolute, but simple conditional here works if container is relative */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
                        <h3 className="text-lg font-semibold text-white mb-4">Guardar Perfil</h3>
                        <input
                            type="text"
                            value={saveAsProfileName}
                            onChange={(e) => setSaveAsProfileName(e.target.value)}
                            placeholder="Nombre del perfil..."
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white mb-4"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowSaveDialog(false)} className="flex-1 py-2 bg-gray-700 text-white rounded-lg">Cancelar</button>
                            <button onClick={handleSaveAsProfile} disabled={saving} className="flex-1 py-2 bg-purple-600 text-white rounded-lg">
                                {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConnectivityPanel;
