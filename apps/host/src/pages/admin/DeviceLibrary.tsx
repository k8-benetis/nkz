// =============================================================================
// Device Library - Admin View for Managing Global Device Profiles
// =============================================================================
// Platform Admins can create, edit, and delete official device profiles
// that are available to all tenants as "certified" templates.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Cable,
    Plus,
    Trash2,
    Edit,
    Search,
    RefreshCw,
    AlertCircle,
    Check,
    BookOpen,
    Globe,
    Building2,
    X
} from 'lucide-react';
import { useAuth } from '@/context/KeycloakAuthContext';
import {
    DeviceProfile,
    MappingEntry,
    listDeviceProfiles,
    createDeviceProfile,
    updateDeviceProfile,
    deleteDeviceProfile,
    listSDMSchemas,
    SDMSchema
} from '@/services/deviceProfilesApi';
import { MappingEditor } from '@/components/connectivity/MappingEditor';

// =============================================================================
// Types
// =============================================================================

interface ProfileModalState {
    isOpen: boolean;
    mode: 'create' | 'edit';
    profile: DeviceProfile | null;
}

// =============================================================================
// Main Component
// =============================================================================

export const DeviceLibrary: React.FC = () => {
    const { hasAnyRole } = useAuth();
    const isPlatformAdmin = hasAnyRole(['PlatformAdmin']);

    // State
    const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
    const [schemas, setSchemas] = useState<SDMSchema[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('');
    const [filterPublic, setFilterPublic] = useState<'all' | 'public' | 'private'>('all');

    // Modal State
    const [modal, setModal] = useState<ProfileModalState>({
        isOpen: false,
        mode: 'create',
        profile: null
    });
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formEntityType, setFormEntityType] = useState('');
    const [formMappings, setFormMappings] = useState<MappingEntry[]>([]);
    const [formIsPublic, setFormIsPublic] = useState(true);
    const [saving, setSaving] = useState(false);

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [fetchedProfiles, fetchedSchemas] = await Promise.all([
                listDeviceProfiles(),
                listSDMSchemas()
            ]);
            setProfiles(fetchedProfiles);
            setSchemas(fetchedSchemas);
        } catch (err: any) {
            setError(err.message || 'Error cargando datos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filter profiles
    const filteredProfiles = profiles.filter(p => {
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        if (filterType && p.sdm_entity_type !== filterType) {
            return false;
        }
        if (filterPublic === 'public' && !p.is_public) {
            return false;
        }
        if (filterPublic === 'private' && p.is_public) {
            return false;
        }
        return true;
    });

    // Open modal for create/edit
    const openCreateModal = () => {
        setFormName('');
        setFormDescription('');
        setFormEntityType(schemas[0]?.type || '');
        setFormMappings([]);
        setFormIsPublic(true);
        setModal({ isOpen: true, mode: 'create', profile: null });
    };

    const openEditModal = (profile: DeviceProfile) => {
        setFormName(profile.name);
        setFormDescription(profile.description || '');
        setFormEntityType(profile.sdm_entity_type);
        setFormMappings(profile.mappings);
        setFormIsPublic(profile.is_public);
        setModal({ isOpen: true, mode: 'edit', profile });
    };

    const closeModal = () => {
        setModal({ isOpen: false, mode: 'create', profile: null });
    };

    // Save profile
    const handleSave = async () => {
        if (!formName.trim() || !formEntityType) {
            setError('Nombre y tipo de entidad son requeridos');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            if (modal.mode === 'create') {
                await createDeviceProfile({
                    name: formName.trim(),
                    description: formDescription.trim(),
                    sdm_entity_type: formEntityType,
                    mappings: formMappings,
                    is_public: formIsPublic
                });
                setSuccess('Perfil creado correctamente');
            } else if (modal.profile) {
                await updateDeviceProfile(modal.profile.id, {
                    name: formName.trim(),
                    description: formDescription.trim(),
                    sdm_entity_type: formEntityType,
                    mappings: formMappings,
                    is_public: formIsPublic
                });
                setSuccess('Perfil actualizado correctamente');
            }

            closeModal();
            await loadData();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Error guardando perfil');
        } finally {
            setSaving(false);
        }
    };

    // Delete profile
    const handleDelete = async (profile: DeviceProfile) => {
        if (!confirm(`¿Eliminar el perfil "${profile.name}"?`)) return;

        try {
            await deleteDeviceProfile(profile.id);
            setSuccess('Perfil eliminado');
            await loadData();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Error eliminando perfil');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-500/20 rounded-xl">
                        <BookOpen className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Librería de Dispositivos</h1>
                        <p className="text-gray-400 text-sm">
                            Gestiona perfiles de mapeo de datos para dispositivos IoT
                        </p>
                    </div>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Perfil
                </button>
            </div>

            {/* Messages */}
            {error && (
                <div className="mb-4 flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <p className="text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {success && (
                <div className="mb-4 flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <Check className="w-4 h-4 text-green-400" />
                    <p className="text-green-300">{success}</p>
                </div>
            )}

            {/* Filters */}
            <div className="mb-6 flex flex-wrap gap-4">
                <div className="flex-1 min-w-[240px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        />
                    </div>
                </div>

                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                    <option value="">Todos los tipos</option>
                    {schemas.map((s) => (
                        <option key={s.type} value={s.type}>{s.type}</option>
                    ))}
                </select>

                <select
                    value={filterPublic}
                    onChange={(e) => setFilterPublic(e.target.value as any)}
                    className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                    <option value="all">Todos</option>
                    <option value="public">🏛️ Oficiales</option>
                    <option value="private">🏠 Privados</option>
                </select>

                <button
                    onClick={loadData}
                    disabled={loading}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Profiles Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProfiles.map((profile) => (
                    <div
                        key={profile.id}
                        className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50 hover:border-purple-500/50 transition-colors"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Cable className="w-5 h-5 text-purple-400" />
                                <h3 className="font-semibold text-white">{profile.name}</h3>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${profile.is_public
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-gray-500/20 text-gray-300'
                                }`}>
                                {profile.is_public ? (
                                    <><Globe className="w-3 h-3" /> Oficial</>
                                ) : (
                                    <><Building2 className="w-3 h-3" /> Privado</>
                                )}
                            </span>
                        </div>

                        <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                            {profile.description || 'Sin descripción'}
                        </p>

                        <div className="flex items-center gap-2 mb-4">
                            <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded">
                                {profile.sdm_entity_type}
                            </span>
                            <span className="text-gray-500 text-xs">
                                {profile.mappings.length} mapeos
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => openEditModal(profile)}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                            >
                                <Edit className="w-4 h-4" />
                                Editar
                            </button>
                            <button
                                onClick={() => handleDelete(profile)}
                                className="px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}

                {filteredProfiles.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 text-gray-500">
                        <Cable className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No hay perfiles que coincidan con los filtros</p>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {modal.isOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">
                        <div className="p-6 border-b border-gray-700">
                            <h2 className="text-xl font-semibold text-white">
                                {modal.mode === 'create' ? 'Nuevo Perfil' : 'Editar Perfil'}
                            </h2>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Nombre *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-purple-500"
                                    placeholder="Davis Vantage Pro 2"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-purple-500"
                                    rows={2}
                                    placeholder="Estación meteorológica Davis con sensores de temperatura, humedad..."
                                />
                            </div>

                            {/* Entity Type */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Tipo de Entidad SDM *</label>
                                <select
                                    value={formEntityType}
                                    onChange={(e) => setFormEntityType(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-purple-500"
                                >
                                    <option value="">Seleccionar...</option>
                                    {schemas.map((s) => (
                                        <option key={s.type} value={s.type}>
                                            {s.type} ({s.attribute_count} atributos)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Public - Only visible to PlatformAdmin */}
                            {isPlatformAdmin && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isPublic"
                                        checked={formIsPublic}
                                        onChange={(e) => setFormIsPublic(e.target.checked)}
                                        className="w-4 h-4"
                                    />
                                    <label htmlFor="isPublic" className="text-sm text-gray-300">
                                        Perfil oficial (visible para todos los tenants)
                                    </label>
                                </div>
                            )}

                            {/* Mappings */}
                            {formEntityType && (
                                <div className="pt-4 border-t border-gray-700">
                                    <MappingEditor
                                        mappings={formMappings}
                                        sdmEntityType={formEntityType}
                                        onChange={setFormMappings}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-700 flex gap-3">
                            <button
                                onClick={closeModal}
                                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !formName.trim() || !formEntityType}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {saving ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviceLibrary;
