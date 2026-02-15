// =============================================================================
// Sensors Management Page - Health Data Grid (Orion-Native)
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import { EntityWizard } from '@/components/EntityWizard';
import { DeleteConfirmationModal } from '@/components/AssetManager/DeleteConfirmationModal';
import { useEntityDependencies } from '@/hooks/useEntityDependencies';
import { useToastContext } from '@/context/ToastContext';
import { UnifiedAsset } from '@/types/assets';
import {
  Gauge,
  Plus,
  Search,
  RefreshCw,
  Activity,
  Battery,
  Signal,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es, enUS, eu } from 'date-fns/locale';

interface SensorEntity {
  id: string;
  type: string;
  name?: { value: string };
  description?: { value: string };
  batteryLevel?: { value: number; observedAt?: string };
  location?: { value: any };
  observedAt?: string;
  // Dynamic attributes
  [key: string]: any;
}

export const Sensors: React.FC = () => {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { hasAnyRole } = useAuth();

  // Auth state
  const canEdit = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);

  // Data state
  const [sensors, setSensors] = useState<SensorEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);

  // Search state (client-side filtering for now, or could be passed to API if supported)
  // Note: Current SDM API doesn't support search text, so we might only filter loaded page 
  // or add search support to backend later. For now, basic client filter on current page.
  const [searchTerm, setSearchTerm] = useState('');
  
  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    entities: UnifiedAsset[];
    dependencies: any[];
    isBlocked: boolean;
  } | null>(null);
  
  // Hooks
  const { success: toastSuccess, error: toastError } = useToastContext();
  const { checkDependenciesBatch, shouldBlockDeletion, isChecking: isCheckingDependencies } = useEntityDependencies();

  // Initial load
  useEffect(() => {
    loadSensors();
  }, [page, pageSize]);

  const loadSensors = async () => {
    setLoading(true);
    try {
      const offset = page * pageSize;
      const response = await api.getSDMEntityInstancesPaginated('AgriSensor', {
        limit: pageSize,
        offset
      });

      if (response && response.instances) {
        setSensors(response.instances);
        setTotalCount(response.total || response.count || 0);
      } else {
        setSensors([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error loading sensors:', error);
      // Fallback for empty state
      setSensors([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get locale for dates
  const getDateLocale = () => {
    switch (language) {
      case 'eu': return eu;
      case 'es': return es;
      default: return enUS;
    }
  };

  // Status calculation
  const getStatus = (sensor: SensorEntity) => {
    // Check various timestamps to determine if active
    let lastActivityStr = sensor.observedAt;

    // Also check property specific observedAt (e.g. from battery or measurement)
    if (!lastActivityStr && sensor.batteryLevel?.observedAt) {
      lastActivityStr = sensor.batteryLevel.observedAt;
    }

    if (!lastActivityStr) return 'unknown';

    try {
      const lastActivity = parseISO(lastActivityStr);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

      if (diffMinutes < 15) return 'online'; // < 15 mins
      if (diffMinutes < 60) return 'warning'; // < 1 hour
      return 'offline';
    } catch (e) {
      return 'unknown';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800 border-green-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'offline': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return t('common.online') || 'Online';
      case 'warning': return t('common.warning') || 'Ausente';
      case 'offline': return t('common.offline') || 'Offline';
      default: return t('common.unknown') || 'Desconocido';
    }
  };
  
  // Convert SensorEntity to UnifiedAsset for modal compatibility
  const sensorToUnifiedAsset = (sensor: SensorEntity): UnifiedAsset => {
    return {
      id: sensor.id,
      type: sensor.type || 'AgriSensor',
      name: sensor.name?.value || sensor.id.split(':').pop() || 'Sensor',
      category: 'sensors',
      status: getStatus(sensor) as any,
      rawEntity: sensor,
      hasLocation: !!sensor.location,
    };
  };
  
  // Handle delete
  const handleDelete = async (sensor: SensorEntity) => {
    const unifiedAsset = sensorToUnifiedAsset(sensor);
    
    // Check dependencies
    const dependencies = await checkDependenciesBatch([unifiedAsset]);
    const isBlocked = shouldBlockDeletion(dependencies);
    
    setDeleteModal({
      entities: [unifiedAsset],
      dependencies,
      isBlocked,
    });
  };
  
  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    
    try {
      for (const entity of deleteModal.entities) {
        await api.deleteSDMEntity(entity.type, entity.id);
      }
      
      toastSuccess(`${deleteModal.entities.length} sensor(es) eliminado(s) correctamente`);
      setDeleteModal(null);
      loadSensors(); // Reload list
    } catch (err: any) {
      toastError(err.message || 'Error al eliminar sensor(es)');
      // Don't close modal on error so user can retry
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Activity className="w-8 h-8 text-teal-600" />
            {t('sensors.title') || 'Inventario de Sensores'}
          </h1>
          <p className="text-gray-500 mt-1">
            {t('sensors.subtitle') || 'Monitorización de estado y salud de dispositivos IoT'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadSensors}
            className="px-4 py-2.5 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition flex items-center gap-2 border border-gray-200 font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh') || 'Actualizar'}
          </button>
          {canEdit && (
            <button
              onClick={() => setShowWizard(true)}
              className="px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition flex items-center gap-2 shadow-lg shadow-teal-600/20 font-medium"
            >
              <Plus className="w-5 h-5" />
              {t('sensors.new_sensor') || 'Añadir Sensor'}
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('common.search') || 'Buscar sensores...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>Total: <strong>{totalCount}</strong> sensores</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Dispositivo
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Batería
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Última Señal
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && sensors.length === 0 ? (
                // Skeleton loading
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                    <td className="px-6 py-4"></td>
                  </tr>
                ))
              ) : sensors.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Gauge className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-medium">No se encontraron sensores</p>
                    <p className="text-sm mt-1">Usa el botón "Añadir Sensor" para comenzar.</p>
                  </td>
                </tr>
              ) : (
                // Rows
                sensors
                  .filter(s => !searchTerm || (s.name?.value || s.id).toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((sensor) => {
                    const status = getStatus(sensor);
                    const battery = sensor.batteryLevel?.value;
                    const lastSignalDate = sensor.observedAt || sensor.batteryLevel?.observedAt;

                    return (
                      <tr key={sensor.id} className="hover:bg-gray-50 transition group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg group-hover:bg-teal-100 transition">
                              <Gauge className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {sensor.name?.value || 'Sin nombre'}
                              </div>
                              <div className="text-xs text-gray-500 font-mono mt-0.5" title={sensor.id}>
                                {sensor.id.split(':').pop()?.substring(0, 12)}...
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === 'online' ? 'bg-green-500 animate-pulse' :
                                status === 'warning' ? 'bg-yellow-500' : 'bg-gray-400'
                              }`}></span>
                            {getStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {battery !== undefined ? (
                            <div className="flex items-center gap-2">
                              <Battery className={`w-4 h-4 ${battery > 50 ? 'text-green-500' :
                                  battery > 20 ? 'text-yellow-500' : 'text-red-500'
                                }`} />
                              <span className="text-sm font-medium text-gray-700">{battery}%</span>
                              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${battery > 50 ? 'bg-green-500' :
                                      battery > 20 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                  style={{ width: `${Math.min(100, Math.max(0, battery))}%` }}
                                ></div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {lastSignalDate ? (
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span title={parseISO(lastSignalDate).toLocaleString()}>
                                {formatDistanceToNow(parseISO(lastSignalDate), { addSuffix: true, locale: getDateLocale() })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs italic">Nunca</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => navigate(`/entities?focus=${encodeURIComponent(sensor.id)}`)}
                              className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-800 transition px-3 py-1.5 rounded-lg hover:bg-teal-50"
                            >
                              <MapPin className="w-4 h-4" />
                              Ver en mapa
                              <ExternalLink className="w-3 h-3 ml-0.5 opacity-50" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => handleDelete(sensor)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800 transition px-3 py-1.5 rounded-lg hover:bg-red-50"
                                title="Eliminar sensor"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setPage(page > 0 ? page - 1 : 0)}
              disabled={page === 0}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * pageSize >= totalCount}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">{page * pageSize + 1}</span> a <span className="font-medium">{Math.min((page + 1) * pageSize, totalCount)}</span> de <span className="font-medium">{totalCount}</span> resultados
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setPage(page > 0 ? page - 1 : 0)}
                  disabled={page === 0}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Anterior</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                {/* Simplified page numbers - just show current */}
                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                  Página {page + 1}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * pageSize >= totalCount}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Siguiente</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Entity Wizard (Unified Creation Flow) */}
      <EntityWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => {
          // Reload list to show new sensor
          loadSensors();
        }}
        initialEntityType="AgriSensor"
      />
      
      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <DeleteConfirmationModal
          entities={deleteModal.entities}
          dependencies={deleteModal.dependencies}
          isBlockedByDependencies={deleteModal.isBlocked}
          isCheckingDependencies={isCheckingDependencies}
          isOpen={!!deleteModal}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
};
