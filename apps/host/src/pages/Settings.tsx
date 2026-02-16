// =============================================================================
// Settings Page - User Profile and Tenant Configuration
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ExternalApiCredentials } from '@/components/ExternalApiCredentials';
import { TenantUsersManagement } from '@/components/TenantUsersManagement';
import { RiskAlertSubscriptions } from '@/components/RiskAlertSubscriptions';
import api from '@/services/api';
import { Copy, Check, Edit2, Save, X } from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, tenantId, hasAnyRole } = useAuth();
  const { t } = useI18n();

  const canModifySettings = hasAnyRole(['PlatformAdmin', 'TenantAdmin']);
  const canManageUsers = hasAnyRole(['PlatformAdmin', 'TenantAdmin']);
  const isReadOnly = hasAnyRole(['TechnicalConsultant']) && !canModifySettings;
  const canViewRisks = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);

  const [copiedTenantId, setCopiedTenantId] = useState(false);

  // User profile editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFirstName, setEditedFirstName] = useState('');
  const [editedLastName, setEditedLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  const currentTenantId = tenantId || user?.tenant || 'N/A';

  useEffect(() => {
    if (user) {
      const nameParts = (user.name || '').split(' ');
      setEditedFirstName(user.firstName || nameParts[0] || '');
      setEditedLastName(user.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''));
    }
  }, [user]);

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
      setNameError(t('settings.profile.name_required'));
      return;
    }

    setSavingName(true);
    setNameError(null);
    setNameSuccess(null);

    try {
      await api.updateUserProfile(editedFirstName.trim(), editedLastName.trim());
      setNameSuccess(t('settings.profile.name_updated'));
      setIsEditingName(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message || t('settings.profile.name_error');
      setNameError(errorMessage);
      if (import.meta.env.DEV) console.error('Error updating user name:', err);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
            <p className="text-gray-600">{t('settings.subtitle')}</p>
          </div>
          <LanguageSelector />
        </div>

        {/* User Profile Card */}
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
                      placeholder={t('settings.profile.first_name')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={savingName}
                    />
                    <input
                      type="text"
                      value={editedLastName}
                      onChange={(e) => setEditedLastName(e.target.value)}
                      placeholder={t('settings.profile.last_name')}
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
                      {savingName ? t('settings.saving') : t('settings.save')}
                    </button>
                    <button
                      onClick={handleCancelEditName}
                      disabled={savingName}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50 text-sm"
                    >
                      <X className="w-4 h-4" />
                      {t('settings.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-gray-900 flex-1">
                    {(user?.firstName || editedFirstName || '').trim() && (user?.lastName || editedLastName || '').trim()
                      ? `${user?.firstName || editedFirstName || ''} ${user?.lastName || editedLastName || ''}`
                      : (user?.firstName || editedFirstName || user?.lastName || editedLastName || t('settings.profile.not_set'))}
                  </p>
                  <button
                    onClick={handleStartEditName}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition text-sm font-medium"
                    title={t('settings.profile.edit_name')}
                  >
                    <Edit2 className="w-4 h-4" />
                    {t('settings.profile.edit')}
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

        {/* External API Credentials */}
        {canModifySettings && (
          <div className="mb-6">
            <ExternalApiCredentials />
          </div>
        )}

        {/* Risk Alert Subscriptions */}
        {canViewRisks && (
          <div className="mb-6">
            <RiskAlertSubscriptions readOnly={isReadOnly} />
          </div>
        )}

        {/* Tenant Users Management */}
        {canManageUsers && (
          <div className="mb-6">
            <TenantUsersManagement canManageUsers={canManageUsers} />
          </div>
        )}

        {/* Read-only mode info for TechnicalConsultant */}
        {isReadOnly && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm">
              <strong>{t('settings.read_only_mode')}:</strong> {t('settings.read_only_description')}
            </p>
          </div>
        )}

        {/* Documentation Links */}
        <div className="mt-6 space-y-2">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">{t('settings.docs.title')}</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://github.com/k8-benetis/nkz/blob/main/docs/api/01-getting-started.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              >
                {t('settings.docs.getting_started')}
              </a>
              <span className="text-gray-400">|</span>
              <a
                href="https://github.com/k8-benetis/nkz/blob/main/docs/api/devices/iot-devices.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              >
                {t('settings.docs.iot_devices')}
              </a>
              <span className="text-gray-400">|</span>
              <a
                href="https://github.com/k8-benetis/nkz/blob/main/docs/api/devices/weather-stations.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              >
                {t('settings.docs.weather_stations')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
