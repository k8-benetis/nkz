// =============================================================================
// Settings Page - Configuration and API Key Management
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { VPNControlPanel } from '@/components/VPNControlPanel';

import { ExternalApiCredentials } from '@/components/ExternalApiCredentials';
import api from '@/services/api';
import { Key, RefreshCw, Copy, Check, AlertTriangle, Eye, EyeOff, Edit2, Save, X, Users, Plus, Trash2, Mail, User } from 'lucide-react';

interface ApiKeyInfo {
  id: string;
  name: string;
  tenant_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  masked_key: string;
}

export const Settings: React.FC = () => {
  const { user, tenantId, hasAnyRole } = useAuth();
  const { t } = useI18n();

  // Settings accesible para TenantAdmin, PlatformAdmin y TechnicalConsultant (solo lectura)
  const canAccessSettings = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);
  const canModifySettings = hasAnyRole(['PlatformAdmin', 'TenantAdmin']); // Solo admins pueden modificar
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);
  const [showRegeneratedKey, setShowRegeneratedKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedTenantId, setCopiedTenantId] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // User profile editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFirstName, setEditedFirstName] = useState('');
  const [editedLastName, setEditedLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  // Tenant users management
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersSuccess, setUsersSuccess] = useState<string | null>(null);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [editingUserData, setEditingUserData] = useState<{ firstName?: string; lastName?: string }>({});
  const [newUser, setNewUser] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    roles: ['Farmer'] as string[],
    temporary: true
  });

  // Get tenant_id from token or API key info
  const currentTenantId = apiKeyInfo?.tenant_id || tenantId || user?.tenant || 'N/A';

  const canManageUsers = hasAnyRole(['PlatformAdmin', 'TenantAdmin']);

  useEffect(() => {
    loadApiKeyInfo();
    if (canManageUsers) {
      loadTenantUsers();
    }
  }, [canManageUsers]);

  // Initialize name fields from user data
  useEffect(() => {
    if (user) {
      const nameParts = (user.name || '').split(' ');
      setEditedFirstName(user.firstName || nameParts[0] || '');
      setEditedLastName(user.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''));
    }
  }, [user]);

  const loadApiKeyInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getApiKeyInfo();
      setApiKeyInfo(data.api_key_info);
    } catch (err: any) {
      // Only show error if it's not a "not found" error (which is expected for new tenants)
      const errorMessage = err?.response?.data?.error || err?.message || '';
      if (errorMessage.includes('not found') || errorMessage.includes('404') || err?.response?.status === 404) {
        // No API key exists yet - this is normal, don't show as error
        setError(null);
        setApiKeyInfo(null);
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('expired') || errorMessage.includes('401')) {
        // Token issues - don't show error, just show that API key needs to be created
        setError(null);
        setApiKeyInfo(null);
      } else {
        setError(errorMessage || t('settings.loading'));
      }
      console.error('Error loading API key:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm(t('settings.regenerate_confirm'))) {
      return;
    }

    setRegenerating(true);
    setError(null);
    try {
      const data = await api.regenerateApiKey();
      setRegeneratedKey(data.api_key);
      setShowRegeneratedKey(true);
      // Reload API key info
      await loadApiKeyInfo();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('settings.regenerate_error'));
      console.error('Error regenerating API key:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyKey = () => {
    if (regeneratedKey) {
      navigator.clipboard.writeText(regeneratedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyTenantId = () => {
    if (currentTenantId && currentTenantId !== 'N/A') {
      navigator.clipboard.writeText(currentTenantId);
      setCopiedTenantId(true);
      setTimeout(() => setCopiedTenantId(false), 2000);
    }
  };

  const handleStartEditName = () => {
    setIsEditingName(true);
    setNameError(null);
    setNameSuccess(null);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    if (user) {
      const nameParts = (user.name || '').split(' ');
      setEditedFirstName(user.firstName || nameParts[0] || '');
      setEditedLastName(user.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''));
    }
    setNameError(null);
    setNameSuccess(null);
  };

  const handleSaveName = async () => {
    if (!editedFirstName.trim()) {
      setNameError('El nombre es requerido');
      return;
    }

    setSavingName(true);
    setNameError(null);
    setNameSuccess(null);

    try {
      await api.updateUserProfile(editedFirstName.trim(), editedLastName.trim());
      setNameSuccess('Nombre actualizado correctamente');
      setIsEditingName(false);

      // Refresh user profile from Keycloak by reloading the page
      // This ensures the context gets the updated profile from Keycloak
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Error al actualizar el nombre';
      setNameError(errorMessage);
      console.error('Error updating user name:', err);
    } finally {
      setSavingName(false);
    }
  };

  const loadTenantUsers = async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const data = await api.getTenantUsers();
      setTenantUsers(data.users || []);
    } catch (err: any) {
      console.error('Error loading tenant users:', err);
      // Don't show error if endpoint doesn't exist
      if (err.response?.status !== 404) {
        setUsersError('Error al cargar usuarios del tenant');
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.firstName) {
      setUsersError('Email, nombre y contraseña son requeridos');
      setUsersSuccess(null);
      return;
    }

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      await api.createTenantUser(newUser);
      setUsersSuccess('Usuario creado exitosamente');
      setShowCreateUserModal(false);
      setNewUser({
        email: '',
        firstName: '',
        lastName: '',
        password: '',
        roles: ['Farmer'],
        temporary: true
      });
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 5000);
    } catch (err: any) {
      setUsersError('Error al crear usuario: ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleEditUser = (userToEdit: any) => {
    setSelectedUser(userToEdit);
    setEditingUserData({
      firstName: userToEdit.firstName || '',
      lastName: userToEdit.lastName || ''
    });
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      await api.updateTenantUser(selectedUser.id, editingUserData);
      setUsersSuccess('Usuario actualizado exitosamente');
      setShowEditUserModal(false);
      setSelectedUser(null);
      setEditingUserData({});
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 5000);
    } catch (err: any) {
      setUsersError('Error al actualizar usuario: ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario ${userEmail}? Esta acción no se puede deshacer.`)) {
      return;
    }

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      await api.deleteTenantUser(userId);
      setUsersSuccess('Usuario eliminado exitosamente');
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 5000);
    } catch (err: any) {
      setUsersError('Error al eliminar usuario: ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('¿Estás seguro de resetear la contraseña de este usuario?')) {
      return;
    }

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      const response = await api.resetTenantUserPassword(userId);
      setUsersSuccess(`Contraseña reseteada. Nueva contraseña temporal: ${response.data?.temporaryPassword || 'generada'}`);
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 10000); // Longer timeout for password reset
    } catch (err: any) {
      setUsersError('Error al resetear contraseña: ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Si no tiene permisos, mostrar mensaje
  if (!canAccessSettings) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Acceso Restringido
            </h2>
            <p className="text-gray-600">
              Solo los administradores del tenant pueden acceder a la configuración.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
            <p className="text-gray-600">{t('settings.subtitle')}</p>
          </div>
          <LanguageSelector />
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.account_info')}</h2>
          {nameError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{nameError}</p>
            </div>
          )}
          {nameSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">{nameSuccess}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">{t('settings.name')}</label>
              {isEditingName ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editedFirstName}
                      onChange={(e) => setEditedFirstName(e.target.value)}
                      placeholder="Nombre"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={savingName}
                    />
                    <input
                      type="text"
                      value={editedLastName}
                      onChange={(e) => setEditedLastName(e.target.value)}
                      placeholder="Apellido"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={savingName}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                    >
                      <Save className="w-4 h-4" />
                      {savingName ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={handleCancelEditName}
                      disabled={savingName}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50 text-sm"
                    >
                      <X className="w-4 h-4" />
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-gray-900 flex-1">
                    {(user?.firstName || editedFirstName || '').trim() && (user?.lastName || editedLastName || '').trim()
                      ? `${user?.firstName || editedFirstName || ''} ${user?.lastName || editedLastName || ''}`
                      : (user?.firstName || editedFirstName || user?.lastName || editedLastName || 'No establecido')}
                  </p>
                  <button
                    onClick={handleStartEditName}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition text-sm font-medium"
                    title="Editar nombre"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">{t('settings.email')}</label>
              <p className="text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">{t('settings.farm')}</label>
              <p className="text-gray-900">{user?.tenant}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">{t('settings.tenant_id')}</label>
              <div className="flex items-center gap-2">
                <p className="text-gray-900 font-mono text-sm flex-1">{currentTenantId}</p>
                {currentTenantId !== 'N/A' && (
                  <button
                    onClick={handleCopyTenantId}
                    className="text-gray-400 hover:text-gray-600 transition"
                    title={t('settings.copy_tenant_id')}
                  >
                    {copiedTenantId ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* API Key Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('settings.api_key')}</h2>
                <p className="text-sm text-gray-600">{t('settings.api_key_description')}</p>
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">{t('settings.loading')}</p>
            </div>
          )}

          {error && !regeneratedKey && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-800 font-medium">{t('settings.error')}</p>
                  <p className="text-red-700 text-sm">{error}</p>
                  {error.includes('not found') && canModifySettings && (
                    <button
                      onClick={handleRegenerateKey}
                      disabled={regenerating}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {regenerating ? t('settings.creating') : t('settings.create_api_key')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && !apiKeyInfo && !error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-yellow-800 font-medium">{t('settings.not_found')}</p>
                  <p className="text-yellow-700 text-sm mb-3">
                    {t('settings.not_found_description')}
                  </p>
                  {canModifySettings && (
                    <button
                      onClick={handleRegenerateKey}
                      disabled={regenerating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 inline mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                      {regenerating ? t('settings.creating') : t('settings.create_api_key')}
                    </button>
                  )}
                  {!canModifySettings && (
                    <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                      Solo los administradores pueden crear o regenerar API keys
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && apiKeyInfo && !regeneratedKey && (
            <>
              {/* Información para Configurar Cliente */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  {t('settings.config_title')}
                </h3>
                <p className="text-blue-800 text-sm mb-3">
                  {t('settings.config_description')}
                </p>
                <div className="space-y-2">
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-blue-700">Tenant ID (Fiware-Service)</label>
                      <button
                        onClick={handleCopyTenantId}
                        className="text-blue-600 hover:text-blue-700"
                        title={t('settings.copy_tenant_id')}
                      >
                        {copiedTenantId ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-gray-900 break-all">{currentTenantId}</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <label className="text-xs font-medium text-blue-700">{t('settings.api_url')}</label>
                    <p className="font-mono text-xs text-gray-900">{window.location.origin}/ngsi-ld/v1/entities</p>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                    <p className="text-xs text-yellow-800">
                      {t('settings.api_key_warning')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">{t('settings.your_api_key')}</label>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${apiKeyInfo.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                      }`}>
                      {apiKeyInfo.is_active ? t('settings.active') : t('settings.inactive')}
                    </span>
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      {showApiKey ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          Ocultar
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          Ver
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {showApiKey ? (
                  <div className="font-mono text-sm text-gray-900 bg-white p-3 rounded border border-gray-200 break-all">
                    {apiKeyInfo.masked_key}
                  </div>
                ) : (
                  <div className="font-mono text-sm text-gray-400 bg-white p-3 rounded border border-gray-200">
                    ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {showApiKey ? t('settings.api_key_hidden') : 'Haz clic en "Ver" para mostrar la API key'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">{t('settings.created')}</label>
                  <p className="text-gray-900 text-sm">
                    {new Date(apiKeyInfo.created_at).toLocaleString('es-ES')}
                  </p>
                </div>
                {apiKeyInfo.updated_at && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t('settings.last_update')}</label>
                    <p className="text-gray-900 text-sm">
                      {new Date(apiKeyInfo.updated_at).toLocaleString('es-ES')}
                    </p>
                  </div>
                )}
              </div>

              {canModifySettings && (
                <button
                  onClick={handleRegenerateKey}
                  disabled={regenerating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-5 h-5 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? t('settings.regenerating') : t('settings.regenerate')}
                </button>
              )}
              {!canModifySettings && (
                <div className="w-full px-4 py-3 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                  Solo los administradores pueden regenerar API keys
                </div>
              )}
            </>
          )}

          {regeneratedKey && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-yellow-800 font-medium">{t('settings.save_new_key')}</p>
                    <p className="text-yellow-700 text-sm">
                      {t('settings.save_new_key_description')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-green-800">{t('settings.new_api_key')}</label>
                  <button
                    onClick={() => setShowRegeneratedKey(!showRegeneratedKey)}
                    className="text-green-600 hover:text-green-700"
                  >
                    {showRegeneratedKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="font-mono text-sm text-green-900 bg-white p-3 rounded border border-green-200 break-all">
                  {showRegeneratedKey ? regeneratedKey : '•'.repeat(64)}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleCopyKey}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        {t('settings.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        {t('settings.copy_api_key')}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setRegeneratedKey(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                  >
                    {t('settings.close')}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">{t('settings.how_to_use')}</h3>
                <p className="text-blue-800 text-sm mb-3">
                  {t('settings.how_to_use_description')}
                </p>
                <div className="space-y-2">
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <label className="text-xs font-medium text-blue-700">API Key</label>
                    <p className="font-mono text-xs text-gray-900 break-all">{regeneratedKey}</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-blue-700">Tenant ID (Fiware-Service)</label>
                      <button
                        onClick={handleCopyTenantId}
                        className="text-blue-600 hover:text-blue-700"
                        title={t('settings.copy_tenant_id')}
                      >
                        {copiedTenantId ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-gray-900 break-all">{currentTenantId}</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <label className="text-xs font-medium text-blue-700">{t('settings.api_url')}</label>
                    <p className="font-mono text-xs text-gray-900 break-all">{window.location.origin}/ngsi-ld/v1/entities</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <a
                    href="/docs/SETUP_REMOTE_PC_SENSOR_CLIENT.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                  >
                    {t('settings.view_guide')}
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* External API Credentials - Solo lectura para TechnicalConsultant */}
        <div className="mt-8">
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Credenciales Externas:</strong> Puedes agregar credenciales para servicios externos como Cesium Ion, Sentinel Hub, AEMET, etc.
              Para Cesium Ion, usa el nombre del servicio "cesium-ion" y tu token de acceso como API Key.
            </p>
          </div>
          <ExternalApiCredentials />
        </div>

        {/* ROS2 Control Panel */}


        {/* VPN Control Panel */}
        <div className="mt-8">
          <VPNControlPanel />
        </div>

        {/* Device Profiles - For all users */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Perfiles de Dispositivos IoT</h2>
                  <p className="text-sm text-gray-600">
                    Crea y gestiona perfiles de mapeo de datos para tus sensores y dispositivos.
                  </p>
                </div>
              </div>
              <a
                href="/system-admin/device-library"
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                Gestionar Perfiles
              </a>
            </div>
          </div>
        </div>

        {/* Tenant Users Management - Solo para admins */}
        {canManageUsers && (
          <div className="mt-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {(usersError || usersSuccess) && (
                <div className={`mb-4 p-3 rounded-lg ${usersSuccess ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className={`text-sm ${usersSuccess ? 'text-green-800' : 'text-red-800'}`}>
                    {usersSuccess || usersError}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Usuarios del Tenant</h2>
                    <p className="text-sm text-gray-600">
                      Gestiona los usuarios de tu tenant (crear, editar, eliminar, resetear contraseñas)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateUserModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Usuario
                </button>
              </div>

              {loadingUsers ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Cargando usuarios...</p>
                </div>
              ) : tenantUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No hay usuarios en este tenant</p>
                  <button
                    onClick={() => setShowCreateUserModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Crear Primer Usuario
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Usuario
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Roles
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tenantUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <User className="w-5 h-5 text-gray-400 mr-2" />
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {u.firstName || ''} {u.lastName || ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{u.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {u.roles?.map((role: string) => (
                                <span
                                  key={role}
                                  className={`px-2 py-1 text-xs font-medium rounded-full ${role === 'PlatformAdmin'
                                    ? 'bg-red-100 text-red-800'
                                    : role === 'TenantAdmin'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-gray-100 text-gray-800'
                                    }`}
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleEditUser(u)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleResetPassword(u.id)}
                                className="text-yellow-600 hover:text-yellow-900"
                                title="Reenviar contraseña"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="text-red-600 hover:text-red-900"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info para TechnicalConsultant */}
        {!canModifySettings && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm">
              <strong>Modo de solo lectura:</strong> Como técnico, puedes ver la configuración pero no modificarla.
              Contacta con un administrador del tenant para realizar cambios.
            </p>
          </div>
        )}

        {/* Documentation Links */}
        <div className="mt-6 space-y-2">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">📚 Documentación:</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://github.com/k8-benetis/nekazari-public/blob/main/docs/WEATHER_STATION_MQTT_GUIDE.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              >
                Configuración de Sensores
              </a>
              <span className="text-gray-400">|</span>
              <a
                href="https://github.com/k8-benetis/nekazari-public/blob/main/docs/architecture/ROS2_ARCHITECTURE.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              >
                Documentación ROS2
              </a>
            </div>
          </div>
        </div>

        {/* Create User Modal */}
        {showCreateUserModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Crear Nuevo Usuario</h3>
                  <button
                    onClick={() => setShowCreateUserModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="usuario@example.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        value={newUser.firstName}
                        onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Juan"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Apellido
                      </label>
                      <input
                        type="text"
                        value={newUser.lastName}
                        onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Pérez"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña Temporal *
                    </label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Contraseña temporal (cambiar en primer login)"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      El usuario deberá cambiar esta contraseña en su primer inicio de sesión
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Roles
                    </label>
                    {[
                      { value: 'Farmer', label: 'Farmer 👨‍🌾', description: 'Acceso básico' },
                      { value: 'DeviceManager', label: 'Device Manager 🤖', description: 'Gestión de robots y sensores' },
                    ].map((role) => (
                      <label key={role.value} className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          checked={newUser.roles.includes(role.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUser({ ...newUser, roles: [...newUser.roles, role.value] });
                            } else {
                              setNewUser({ ...newUser, roles: newUser.roles.filter(r => r !== role.value) });
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">{role.label} - {role.description}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowCreateUserModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateUser}
                    disabled={loadingUsers || !newUser.email || !newUser.password || !newUser.firstName}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingUsers ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditUserModal && selectedUser && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Editar Usuario: {selectedUser.firstName} {selectedUser.lastName}
                  </h3>
                  <button
                    onClick={() => {
                      setShowEditUserModal(false);
                      setSelectedUser(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    {selectedUser.email}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={editingUserData.firstName || ''}
                      onChange={(e) => setEditingUserData({ ...editingUserData, firstName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Apellido
                    </label>
                    <input
                      type="text"
                      value={editingUserData.lastName || ''}
                      onChange={(e) => setEditingUserData({ ...editingUserData, lastName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setShowEditUserModal(false);
                      setSelectedUser(null);
                      setEditingUserData({});
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdateUser}
                    disabled={loadingUsers}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingUsers ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Settings;

