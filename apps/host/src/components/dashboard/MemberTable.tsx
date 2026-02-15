import React from 'react';
import {
  Users,
  Mail,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Edit2,
  Lock,
  Trash2,
  UserPlus,
} from 'lucide-react';

export interface MemberTableRow {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  createdAt: string;
  enabled: boolean;
}

interface MemberTableProps {
  members: MemberTableRow[];
  loading?: boolean;
  onEdit?: (member: MemberTableRow) => void;
  onResetPassword?: (member: MemberTableRow) => void;
  onDelete?: (member: MemberTableRow) => void;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  className?: string;
}

const getRoleBadge = (role: string) => {
  const base = 'inline-flex px-2 py-1 text-xs font-semibold rounded-full';
  switch (role) {
    case 'PlatformAdmin':
      return `${base} bg-purple-100 text-purple-800`;
    case 'TenantAdmin':
      return `${base} bg-blue-100 text-blue-800`;
    case 'DeviceManager':
      return `${base} bg-green-100 text-green-800`;
    case 'Farmer':
      return `${base} bg-yellow-100 text-yellow-800`;
    default:
      return `${base} bg-gray-100 text-gray-800`;
  }
};

export const MemberTable: React.FC<MemberTableProps> = ({
  members,
  loading = false,
  onEdit,
  onResetPassword,
  onDelete,
  emptyActionLabel,
  onEmptyAction,
  className = '',
}) => {
  if (loading && members.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="inline-block w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando miembros del equipo...</p>
      </div>
    );
  }

  if (!loading && members.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Todavía no hay usuarios en el equipo.</p>
        {onEmptyAction ? (
          <button
            onClick={onEmptyAction}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200 mx-auto"
          >
            <UserPlus className="w-4 h-4" />
            {emptyActionLabel ?? 'Crear usuario'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Usuario
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Roles
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Creado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Estado
            </th>
            {(onEdit || onResetPassword || onDelete) && (
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {members.map((member) => (
            <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.fullName}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {member.email}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-wrap gap-1">
                  {member.roles.map((role) => (
                    <span key={`${member.id}-${role}`} className={getRoleBadge(role)}>
                      {role}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(member.createdAt).toLocaleDateString('es-ES')}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {member.enabled ? (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    <CheckCircle className="w-3 h-3 mr-1" /> Activo
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Inactivo
                  </span>
                )}
              </td>
              {(onEdit || onResetPassword || onDelete) && (
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {onEdit ? (
                      <button
                        onClick={() => onEdit(member)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Editar roles"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    ) : null}
                    {onResetPassword ? (
                      <button
                        onClick={() => onResetPassword(member)}
                        className="text-orange-600 hover:text-orange-900"
                        title="Resetear contraseña"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        onClick={() => onDelete(member)}
                        className="text-red-600 hover:text-red-900"
                        title="Eliminar usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MemberTable;
