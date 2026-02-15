// =============================================================================
// Team Management Component - Gestión de Usuarios por TenantAdmin
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import {
  Users,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Mail,
} from 'lucide-react';
import { MemberTable, MemberTableRow } from '@/components/dashboard/MemberTable';

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  createdAt: string;
  enabled: boolean;
}

interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  password: string;
  temporary?: boolean;
}

export const TeamManagement: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [newUser, setNewUser] = useState<CreateUserRequest>({
    email: '',
    firstName: '',
    lastName: '',
    roles: ['Farmer'],
    password: '',
    temporary: true
  });
  const [editingRoles, setEditingRoles] = useState<string[]>([]);

  const isAdmin = user?.roles?.includes('PlatformAdmin') || user?.roles?.includes('TenantAdmin');

  const memberRows: MemberTableRow[] = members.map((member) => ({
    id: member.id,
    email: member.email,
    fullName: `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email,
    roles: member.roles,
    createdAt: member.createdAt,
    enabled: member.enabled,
  }));

  const getOriginalMember = (row: MemberTableRow) => members.find((m) => m.id === row.id) || null;

  // Available roles that TenantAdmin can assign
  const assignableRoles = [
    { value: 'Farmer', label: 'Farmer 👨‍🌾', description: 'Acceso básico a dashboard' },
    { value: 'DeviceManager', label: 'Device Manager 🤖', description: 'Gestión de robots y sensores' }
  ];

  useEffect(() => {
    if (isAdmin) {
      loadTeamMembers();
    }
  }, [isAdmin]);

  const loadTeamMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try tenant-user-api endpoint
      const response = await api.get('/api/tenant/users');
      setMembers(response.data.users || []);
    } catch (err: any) {
      // If endpoint doesn't exist, show info message instead of error
      if (err.response?.status === 404) {
        setError('⚠️ Endpoint no disponible. La gestión de usuarios se realiza desde Keycloak.');
        console.warn('Team members endpoint not available:', err);
      } else {
        setError('Error al cargar miembros del equipo: ' + (err.response?.data?.error || err.message));
        console.error('Error loading team members:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password) {
      setError('Email y contraseña son requeridos');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.post('/api/tenant/users', newUser);
      setSuccess('Usuario creado exitosamente');
      setShowCreateModal(false);
      setNewUser({
        email: '',
        firstName: '',
        lastName: '',
        roles: ['Farmer'],
        password: '',
        temporary: true
      });
      loadTeamMembers();
    } catch (err: any) {
      setError('Error al crear usuario: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRoles = async (userId: string, roles: string[]) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.put(`/api/tenant/users/${userId}/roles`, { roles });
      setSuccess('Roles actualizados exitosamente');
      setShowEditModal(false);
      setSelectedMember(null);
      loadTeamMembers();
    } catch (err: any) {
      setError('Error al actualizar roles: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este usuario? Esta acción no se puede deshacer.')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.delete(`/api/tenant/users/${userId}`);
      setSuccess('Usuario eliminado exitosamente');
      loadTeamMembers();
    } catch (err: any) {
      setError('Error al eliminar usuario: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('¿Estás seguro de que quieres resetear la contraseña de este usuario?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.post(`/api/tenant/users/${userId}/reset-password`);
      setSuccess('Contraseña reseteada. Nueva contraseña: ' + response.data.temporaryPassword);
    } catch (err: any) {
      setError('Error al resetear contraseña: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (member: TeamMember) => {
    setSelectedMember(member);
    setEditingRoles([...member.roles]);
    setShowEditModal(true);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-600 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h1>
            <p className="text-gray-600">
              No tienes permisos para gestionar usuarios del equipo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Users className="h-6 w-6 text-blue-600 mr-3" />
            <h2 className="text-lg font-semibold text-gray-900">Gestión de Equipo</h2>
          </div>
          <button
            onClick={loadTeamMembers}
            disabled={loading}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {members.length} {members.length === 1 ? 'usuario' : 'usuarios'} en el equipo
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </button>
      </div>

      {/* Members Table */}
      <div className="p-6">
        <MemberTable
          members={memberRows}
          loading={loading}
          onEdit={(row) => {
            const original = getOriginalMember(row);
            if (original) {
              openEditModal(original);
            }
          }}
          onResetPassword={(row) => handleResetPassword(row.id)}
          onDelete={(row) => handleDeleteUser(row.id)}
          emptyActionLabel="Crear Primer Usuario"
          onEmptyAction={() => setShowCreateModal(true)}
        />
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Crear Nuevo Usuario</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  {assignableRoles.map((role) => (
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
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={loading || !newUser.email || !newUser.password}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Roles Modal */}
      {showEditModal && selectedMember && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Editar Roles: {selectedMember.firstName} {selectedMember.lastName}
                </h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedMember(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  {selectedMember.email}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Roles Asignados
                  </label>
                  {assignableRoles.map((role) => (
                    <label key={role.value} className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        checked={editingRoles.includes(role.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditingRoles([...editingRoles, role.value]);
                          } else {
                            setEditingRoles(editingRoles.filter(r => r !== role.value));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{role.label} - {role.description}</span>
                    </label>
                  ))}
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Solo puedes asignar los roles Farmer y DeviceManager. 
                    Los roles PlatformAdmin y TenantAdmin solo pueden ser asignados por un administrador de plataforma.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedMember(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleUpdateRoles(selectedMember.id, editingRoles)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

