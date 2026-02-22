// =============================================================================
// Robots Management Page
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Bot,
  Plus,
  Battery,
  MapPin,
  Radio,
  Edit2,
  Trash2,
  X,
  Save,
} from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useViewer } from '@/context/ViewerContext';
import api from '@/services/api';
import { CesiumMap } from '@/components/CesiumMap';
import { MapDrawingOverlay } from '@/components/viewer/MapDrawingOverlay';
import { EntityWizard } from '@/components/EntityWizard';
import { DynamicRobotControlPanel } from '@/components/DynamicRobotControlPanel';
import { RobotControlPanel } from '@/components/RobotControlPanel';
import { ROS2NodeMonitor } from '@/components/ROS2NodeMonitor';
import { ROS2CameraViewer } from '@/components/ROS2CameraViewer';
import { ROS2AlertsPanel } from '@/components/ROS2AlertsPanel';
import { logger } from '@/utils/logger';
import type { Robot } from '@/types';

const ROBOT_FORM_INITIAL = {
  name: '',
  robotType: 'other',
  manufacturer: '',
  model: '',
  serialNumber: '',
  rosDomainId: '',
  latitude: 0,
  longitude: 0,
  notes: '',
};

export const Robots: React.FC = () => {
  const { t } = useI18n();
  const { hasAnyRole } = useAuth();
  const { mapMode, setMapMode, drawingType, drawingCallback: drawingCallbackFromContext } = useViewer();

  const canEdit = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant']);

  const [robots, setRobots] = useState<Robot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [showWizard, setShowWizard] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRobot, setEditingRobot] = useState<Robot | null>(null);
  const [formData, setFormData] = useState(ROBOT_FORM_INITIAL);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedRobotForControl, setSelectedRobotForControl] = useState<Robot | null>(null);

  const loadRobots = async () => {
    setIsLoading(true);
    try {
      const list = await api.getRobotsSDM();
      setRobots(Array.isArray(list) ? list : []);
    } catch (err) {
      logger.error('Error loading robots:', err);
      setRobots([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRobots();
  }, []);

  const filteredRobots = useMemo(() => {
    let list = robots;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          (r.name?.value ?? '').toLowerCase().includes(term) ||
          (r.id ?? '').toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((r) => (r.status?.value ?? '') === statusFilter);
    }
    return list;
  }, [robots, searchTerm, statusFilter]);

  const handleGenericDrawingComplete = (geometry: unknown) => {
    logger.debug('[Robots] Generic drawing complete:', geometry);
    if (drawingCallbackFromContext) {
      drawingCallbackFromContext(geometry);
    }
    setMapMode('VIEW');
  };

  const handleCreate = () => setShowWizard(true);

  const handleEdit = (robot: Robot) => {
    setEditingRobot(robot);
    const name = (robot.name && typeof robot.name === 'object' && 'value' in robot.name)
      ? String((robot.name as { value: string }).value)
      : String(robot.id ?? '');
    setFormData({
      ...ROBOT_FORM_INITIAL,
      name,
      latitude: robot.location?.value?.coordinates?.[1] ?? 0,
      longitude: robot.location?.value?.coordinates?.[0] ?? 0,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingRobot) return;
    try {
      await api.updateRobotSDM(editingRobot.id, {
        name: { type: 'Property', value: formData.name },
        location: formData.latitude && formData.longitude
          ? {
              type: 'GeoProperty',
              value: {
                type: 'Point',
                coordinates: [formData.longitude, formData.latitude],
              },
            }
          : undefined,
      });
      setShowModal(false);
      setEditingRobot(null);
      setFormData(ROBOT_FORM_INITIAL);
      await loadRobots();
    } catch (err) {
      logger.error('Error saving robot:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteRobotSDM(id);
      await loadRobots();
      if (selectedRobotForControl?.id === id) setSelectedRobotForControl(null);
    } catch (err) {
      logger.error('Error deleting robot:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
      case 'online':
      case 'connected':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'charging':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
      case 'offline':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'maintenance':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <>
      {/* Optional: search and filter bar - keeps setSearchTerm/setStatusFilter used */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder={t('common.search') || 'Buscar...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="all">{t('robots.filter_all') || 'Todos'}</option>
          <option value="idle">{t('robots.idle')}</option>
          <option value="working">{t('robots.working')}</option>
          <option value="charging">{t('robots.charging')}</option>
          <option value="offline">{t('robots.offline')}</option>
        </select>
      </div>

      <div className="mb-8 relative">
        <CesiumMap
          title={t('robots.map_title')}
          height="h-[400px]"
          showControls={true}
          robots={filteredRobots}
          enable3DTerrain={true}
          terrainProvider="auto"
        />
        {mapMode === 'DRAW_GEOMETRY' && (
          <MapDrawingOverlay
            enabled={true}
            drawingType={drawingType || 'Polygon'}
            onComplete={handleGenericDrawingComplete}
            onCancel={() => setMapMode('VIEW')}
          />
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 mt-4">{t('robots.loading')}</p>
        </div>
      ) : filteredRobots.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-lg">
          <Bot className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchTerm || statusFilter !== 'all' ? t('robots.no_robots_found') : t('robots.no_robots_registered')}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchTerm || statusFilter !== 'all'
              ? t('robots.try_other_filters')
              : t('robots.add_first_robot')}
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <p className="text-sm text-gray-500 mb-4">{t('robots.no_robots_help')}</p>
          )}
          {!searchTerm && statusFilter === 'all' && canEdit && (
            <button
              onClick={handleCreate}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {t('robots.create_first_robot')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRobots.map((robot) => (
            <div
              key={robot.id}
              className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition overflow-hidden"
            >
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">
                        {robot.name?.value || robot.id}
                      </h3>
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(robot.status?.value || 'idle')}`}
                      >
                        {robot.status?.value ? t(`robots.${robot.status.value}`) : t('robots.unknown')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {robot.batteryLevel != null && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <Battery className="w-4 h-4" />
                          {t('robots.battery')}
                        </span>
                        <span className="font-bold text-gray-900">{robot.batteryLevel.value}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            robot.batteryLevel.value > 50
                              ? 'bg-green-500'
                              : robot.batteryLevel.value > 20
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${robot.batteryLevel.value}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {robot.location?.value?.coordinates && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>
                        {robot.location.value.coordinates[1].toFixed(6)}, {robot.location.value.coordinates[0].toFixed(6)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        robot.status?.value === 'working'
                          ? 'bg-green-500 animate-pulse'
                          : robot.status?.value === 'charging'
                            ? 'bg-yellow-500 animate-pulse'
                            : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-xs text-gray-500">
                      {robot.status?.value === 'working'
                        ? t('robots.in_operation')
                        : robot.status?.value === 'charging'
                          ? t('robots.charging_battery')
                          : robot.status?.value === 'idle'
                            ? t('robots.waiting')
                            : t('robots.unknown_status')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => setSelectedRobotForControl(robot)}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition flex items-center justify-center gap-2 font-semibold shadow-md"
                    title={t('robots.control_panel_tooltip') || 'Abrir panel de control ROS2'}
                  >
                    <Radio className="w-5 h-5" />
                    {t('robots.control_panel')}
                  </button>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => handleEdit(robot)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        {t('robots.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(robot.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedRobotForControl != null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Radio className="w-6 h-6" />
                {t('robots.control_panel')} - {selectedRobotForControl.name?.value || selectedRobotForControl.id}
              </h2>
              <button
                onClick={() => setSelectedRobotForControl(null)}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {selectedRobotForControl.capabilities != null ? (
                <DynamicRobotControlPanel
                  robot={selectedRobotForControl}
                  robotId={selectedRobotForControl.id}
                />
              ) : (
                <RobotControlPanel
                  robotId={selectedRobotForControl.id}
                  robotName={selectedRobotForControl.name?.value || selectedRobotForControl.id}
                  status={selectedRobotForControl.status?.value || 'unknown'}
                />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ROS2NodeMonitor robotId={selectedRobotForControl.id} />
                <ROS2CameraViewer
                  robotId={selectedRobotForControl.id}
                  width={640}
                  height={480}
                  autoStart={true}
                />
              </div>
              <ROS2AlertsPanel robotId={selectedRobotForControl.id} />
            </div>
          </div>
        </div>
      )}

      <EntityWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => {
          setShowWizard(false);
          loadRobots();
        }}
        initialEntityType="AgriculturalRobot"
      />

      {showModal && editingRobot != null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Bot className="w-6 h-6" />
                {t('robots.edit_robot')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
              <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('robots.basic_info') || 'Información Básica'}</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.robot_name')} *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    placeholder={t('robots.robot_name_placeholder')}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.robot_type') || 'Tipo de Robot'} *</label>
                  <select
                    value={formData.robotType}
                    onChange={(e) => setFormData({ ...formData, robotType: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  >
                    <option value="harvester">{t('robots.type_harvester') || 'Cosechador'}</option>
                    <option value="sprayer">{t('robots.type_sprayer') || 'Pulverizador'}</option>
                    <option value="planter">{t('robots.type_planter') || 'Sembrador'}</option>
                    <option value="weeder">{t('robots.type_weeder') || 'Desherbador'}</option>
                    <option value="harvester_assistant">{t('robots.type_assistant') || 'Asistente de Cosecha'}</option>
                    <option value="other">{t('robots.type_other') || 'Otro'}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.manufacturer') || 'Fabricante'}</label>
                    <input
                      type="text"
                      value={formData.manufacturer}
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      placeholder={t('robots.manufacturer_placeholder') || 'Ej: John Deere'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.model') || 'Modelo'}</label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      placeholder={t('robots.model_placeholder') || 'Ej: 6130M'}
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.serial_number') || 'Número de Serie'}</label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    placeholder={t('robots.serial_number_placeholder') || 'Ej: SN-2024-001'}
                  />
                </div>
              </div>
              <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Conectividad</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ROS_DOMAIN_ID</label>
                    <input
                      type="number"
                      value={formData.rosDomainId}
                      onChange={(e) => setFormData({ ...formData, rosDomainId: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      placeholder="0-101"
                    />
                  </div>
                </div>
              </div>
              <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('robots.location')}</h3>
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.latitude')}</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      placeholder={t('robots.latitude_placeholder') || '42.571493'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('robots.longitude')}</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      placeholder={t('robots.longitude_placeholder') || '-2.028218'}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="w-full px-4 py-2 border-2 border-dashed border-purple-300 rounded-lg text-purple-700 hover:bg-purple-50 transition flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  Seleccionar en el mapa
                </button>
                {showMapPicker && (
                  <div className="mt-2 p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-gray-600">Selección en mapa (próximamente)</span>
                    <button type="button" onClick={() => setShowMapPicker(false)} className="text-purple-600 hover:underline">
                      Cerrar
                    </button>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('robots.notes') || 'Notas'}</h3>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  placeholder={t('robots.notes_placeholder') || 'Notas adicionales sobre el robot...'}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end rounded-b-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name || !editingRobot}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {t('robots.save_changes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
