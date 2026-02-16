// =============================================================================
// Tenant Users Management Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import { Users, Plus, Trash2, Mail, User, Edit2, X } from 'lucide-react';

interface TenantUsersManagementProps {
  canManageUsers: boolean;
}

export const TenantUsersManagement: React.FC<TenantUsersManagementProps> = ({ canManageUsers }) => {
  const { t } = useI18n();

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

  useEffect(() => {
    if (canManageUsers) {
      loadTenantUsers();
    }
  }, [canManageUsers]);

  const loadTenantUsers = async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const data = await api.getTenantUsers();
      setTenantUsers(data.users || []);
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Error loading tenant users:', err);
      if (err.response?.status !== 404) {
        setUsersError(t('settings.users.load_error'));
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.firstName) {
      setUsersError(t('settings.users.required_fields'));
      setUsersSuccess(null);
      return;
    }

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      await api.createTenantUser(newUser);
      setUsersSuccess(t('settings.users.created_success'));
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
      setUsersError(t('settings.users.create_error') + ': ' + (err.response?.data?.error || err.message));
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
      setUsersSuccess(t('settings.users.updated_success'));
      setShowEditUserModal(false);
      setSelectedUser(null);
      setEditingUserData({});
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 5000);
    } catch (err: any) {
      setUsersError(t('settings.users.update_error') + ': ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(t('settings.users.delete_confirm').replace('{email}', userEmail))) {
      return;
    }

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      await api.deleteTenantUser(userId);
      setUsersSuccess(t('settings.users.deleted_success'));
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 5000);
    } catch (err: any) {
      setUsersError(t('settings.users.delete_error') + ': ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm(t('settings.users.reset_confirm'))) {
      return;
    }

    setLoadingUsers(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      const response = await api.resetTenantUserPassword(userId);
      setUsersSuccess(t('settings.users.reset_success').replace('{password}', response.data?.temporaryPassword || t('settings.users.generated')));
      await loadTenantUsers();
      setTimeout(() => setUsersSuccess(null), 10000);
    } catch (err: any) {
      setUsersError(t('settings.users.reset_error') + ': ' + (err.response?.data?.error || err.message));
      setUsersSuccess(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  if (!canManageUsers) return null;

  return (
    <>
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
              <h2 className="text-lg font-semibold text-gray-900">{t('settings.users.title')}</h2>
              <p className="text-sm text-gray-600">{t('settings.users.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateUserModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            {t('settings.users.new_user')}
          </button>
        </div>

        {loadingUsers ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">{t('settings.loading')}</p>
          </div>
        ) : tenantUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">{t('settings.users.no_users')}</p>
            <button
              onClick={() => setShowCreateUserModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {t('settings.users.create_first')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('settings.users.table_user')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('settings.users.table_email')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('settings.users.table_roles')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('settings.users.table_actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenantUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-5 h-5 text-gray-400 mr-2" />
                        <div className="text-sm font-medium text-gray-900">
                          {u.firstName || ''} {u.lastName || ''}
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
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              role === 'PlatformAdmin'
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
                          title={t('settings.users.edit')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="text-yellow-600 hover:text-yellow-900"
                          title={t('settings.users.reset_password')}
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="text-red-600 hover:text-red-900"
                          title={t('settings.users.delete')}
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

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">{t('settings.users.create_title')}</h3>
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
                    {t('settings.users.email')} *
                  </label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="user@example.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('settings.users.first_name')} *
                    </label>
                    <input
                      type="text"
                      value={newUser.firstName}
                      onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('settings.users.last_name')}
                    </label>
                    <input
                      type="text"
                      value={newUser.lastName}
                      onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.users.temp_password')} *
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('settings.users.temp_password_hint')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('settings.users.roles')}
                  </label>
                  {[
                    { value: 'Farmer', label: t('settings.users.role_farmer'), description: t('settings.users.role_farmer_desc') },
                    { value: 'DeviceManager', label: t('settings.users.role_device_manager'), description: t('settings.users.role_device_manager_desc') },
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
                  {t('settings.cancel')}
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={loadingUsers || !newUser.email || !newUser.password || !newUser.firstName}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingUsers ? t('settings.users.creating') : t('settings.users.create_button')}
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
                  {t('settings.users.edit_title')}: {selectedUser.firstName} {selectedUser.lastName}
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
                    {t('settings.users.first_name')}
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
                    {t('settings.users.last_name')}
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
                  {t('settings.cancel')}
                </button>
                <button
                  onClick={handleUpdateUser}
                  disabled={loadingUsers}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingUsers ? t('settings.saving') : t('settings.save_changes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
