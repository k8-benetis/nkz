// =============================================================================
// IoT Configuration - Admin Panel Tab
// Processing Profiles Management with TelemetryStats visualization
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings,
    Plus,
    Edit,
    Trash2,
    Activity,
    Database,
    Clock,
    RefreshCw,
    CheckCircle,
    XCircle,
    TrendingDown,
    Cpu
} from 'lucide-react';
import {
    listProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    getTelemetryStats,
    getDeviceTypes,
    ProcessingProfile,
    CreateProfileData,
    TelemetryStats
} from '@/services/profilesApi';

// =============================================================================
// Subcomponents
// =============================================================================

interface StatsCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    className?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, subtitle, icon, trend, className = '' }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
                {subtitle && (
                    <p className={`text-sm mt-1 ${trend === 'up' ? 'text-green-600' :
                            trend === 'down' ? 'text-red-600' :
                                'text-gray-500 dark:text-gray-400'
                        }`}>
                        {subtitle}
                    </p>
                )}
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                {icon}
            </div>
        </div>
    </div>
);

// Simple bar for storage savings
const StorageSavingsBar: React.FC<{ percent: number }> = ({ percent }) => (
    <div className="mt-4">
        <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-600 dark:text-gray-400">Ahorro de Almacenamiento</span>
            <span className="text-sm font-medium text-green-600">{percent}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
                className="bg-gradient-to-r from-green-400 to-green-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(percent, 100)}%` }}
            />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Datos filtrados por throttle/delta vs total recibidos
        </p>
    </div>
);

// Profile row component
interface ProfileRowProps {
    profile: ProcessingProfile;
    onEdit: (profile: ProcessingProfile) => void;
    onDelete: (id: string) => void;
}

const ProfileRow: React.FC<ProfileRowProps> = ({ profile, onEdit, onDelete }) => {
    const throttleInterval = profile.config?.sampling_rate?.interval_seconds || 0;
    const deltaCount = Object.keys(profile.config?.delta_threshold || {}).length;

    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    <span className="font-medium text-gray-900 dark:text-white">{profile.device_type}</span>
                </div>
            </td>
            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{profile.name}</td>
            <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-sm">
                    <Clock className="w-3 h-3" />
                    {throttleInterval}s
                </span>
            </td>
            <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md text-sm">
                    <TrendingDown className="w-3 h-3" />
                    {deltaCount} attrs
                </span>
            </td>
            <td className="px-4 py-3">
                {profile.is_active ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" /> Activo
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400">
                        <XCircle className="w-4 h-4" /> Inactivo
                    </span>
                )}
            </td>
            <td className="px-4 py-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => onEdit(profile)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(profile.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </td>
        </tr>
    );
};

// =============================================================================
// Main Component
// =============================================================================

export const IoTConfiguration: React.FC = () => {
    // State
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [stats, setStats] = useState<TelemetryStats | null>(null);
    const [, setDeviceTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ProcessingProfile | null>(null);

    // Form state for create/edit
    const [formData, setFormData] = useState<CreateProfileData>({
        device_type: '',
        name: '',
        config: {
            sampling_rate: { mode: 'throttle', interval_seconds: 60 },
            delta_threshold: {},
            ignore_attributes: [],
        }
    });

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [profilesData, statsData, typesData] = await Promise.all([
                listProfiles(),
                getTelemetryStats(24),
                getDeviceTypes().catch(() => [])
            ]);
            setProfiles(profilesData);
            setStats(statsData);
            setDeviceTypes(typesData);
        } catch (err) {
            console.error('Error loading IoT data:', err);
            setError('Error al cargar los datos de IoT');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handlers
    const handleCreateProfile = async () => {
        try {
            await createProfile(formData);
            setShowCreateModal(false);
            setFormData({
                device_type: '',
                name: '',
                config: { sampling_rate: { mode: 'throttle', interval_seconds: 60 } }
            });
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Error al crear perfil');
        }
    };

    const handleUpdateProfile = async () => {
        if (!editingProfile) return;
        try {
            await updateProfile(editingProfile.id, {
                name: formData.name,
                config: formData.config,
                is_active: true
            });
            setEditingProfile(null);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Error al actualizar perfil');
        }
    };

    const handleDeleteProfile = async (id: string) => {
        if (!confirm('¿Seguro que quieres eliminar este perfil?')) return;
        try {
            await deleteProfile(id);
            await loadData();
        } catch (err) {
            setError('Error al eliminar perfil');
        }
    };

    const handleEdit = (profile: ProcessingProfile) => {
        setEditingProfile(profile);
        setFormData({
            device_type: profile.device_type,
            name: profile.name,
            description: profile.description || undefined,
            config: profile.config
        });
    };

    // Render
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Configuración IoT</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Perfiles de procesamiento para telemetría</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={loadData}
                        className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Perfil
                    </button>
                </div>
            </div>

            {/* Error message */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatsCard
                        title="Mensajes Recibidos"
                        value={stats.total_received.toLocaleString()}
                        subtitle={`Últimas ${stats.period_hours}h`}
                        icon={<Activity className="w-6 h-6 text-blue-600" />}
                    />
                    <StatsCard
                        title="Mensajes Persistidos"
                        value={stats.total_persisted.toLocaleString()}
                        subtitle="Guardados en TimescaleDB"
                        icon={<Database className="w-6 h-6 text-green-600" />}
                    />
                    <StatsCard
                        title="Ahorro Almacenamiento"
                        value={`${stats.storage_savings_percent}%`}
                        subtitle="Menos datos = más rendimiento"
                        icon={<TrendingDown className="w-6 h-6 text-purple-600" />}
                        trend="up"
                    />
                    <StatsCard
                        title="Perfiles Activos"
                        value={profiles.filter(p => p.is_active).length}
                        subtitle={`de ${profiles.length} total`}
                        icon={<Cpu className="w-6 h-6 text-orange-600" />}
                    />
                </div>
            )}

            {/* Storage Savings Visual */}
            {stats && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        Gobernanza del Dato
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        El Motor de Reglas del telemetry-worker filtra datos redundantes antes de persistir
                    </p>
                    <StorageSavingsBar percent={stats.storage_savings_percent} />
                </div>
            )}

            {/* Profiles Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Perfiles de Procesamiento
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tipo Dispositivo</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nombre</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Throttle</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Delta</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {profiles.map((profile) => (
                                <ProfileRow
                                    key={profile.id}
                                    profile={profile}
                                    onEdit={handleEdit}
                                    onDelete={handleDeleteProfile}
                                />
                            ))}
                            {profiles.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        No hay perfiles configurados. Crea uno para empezar.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || editingProfile) && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {editingProfile ? 'Editar Perfil' : 'Nuevo Perfil'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Tipo de Dispositivo
                                </label>
                                <input
                                    type="text"
                                    value={formData.device_type}
                                    onChange={(e) => setFormData({ ...formData, device_type: e.target.value })}
                                    disabled={!!editingProfile}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                                    placeholder="AgriSensor, Tractor, etc."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Nombre del Perfil
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="Mi perfil personalizado"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Intervalo de Throttle (segundos)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.config?.sampling_rate?.interval_seconds || 60}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        config: {
                                            ...formData.config,
                                            sampling_rate: {
                                                mode: 'throttle',
                                                interval_seconds: parseInt(e.target.value) || 0
                                            }
                                        }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    0 = sin throttle (guardar todos los mensajes)
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingProfile(null);
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={editingProfile ? handleUpdateProfile : handleCreateProfile}
                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                                {editingProfile ? 'Guardar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IoTConfiguration;
