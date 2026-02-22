// =============================================================================
// Robot Control Panel - ROS2 Integration
// =============================================================================

import React, { useState } from 'react';
import {
  StopCircle,
  Play,
  Home,
  FileText,
  Radio,
  AlertTriangle,

  CheckCircle,
  Network,
  Loader
} from 'lucide-react';
import { ROS2CameraViewer } from './ROS2CameraViewer';
import { ROS2NodeMonitor } from './ROS2NodeMonitor';
import { ROS2AlertsPanel } from './ROS2AlertsPanel';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';

interface RobotControlPanelProps {
  robotId: string;
  robotName: string;
  status: string;
}

export const RobotControlPanel: React.FC<RobotControlPanelProps> = ({
  robotId,
  robotName,
  status
}) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

  const [loadingROS, setLoadingROS] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToastMsg = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleEmergencyStop = async () => {
    if (!confirm(t('robots.emergency_stop_confirm'))) {
      return;
    }

    setLoading(true);
    try {
      await api.sendRobotEmergencyStop(robotId);
      setLastCommand(t('robots.emergency_stop_sent'));
      setTimeout(() => setLastCommand(null), 3000);
    } catch (error: any) {
      alert(`Error: ${error.message || t('robots.command_error')}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      await api.sendRobotResume(robotId);
      setLastCommand(t('robots.resume_sent'));
      setTimeout(() => setLastCommand(null), 3000);
    } catch (error: any) {
      alert(`Error: ${error.message || t('robots.command_error')}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeSelect = (nodeName: string) => {
    setSelectedNodes(prev => {
      if (prev.includes(nodeName)) {
        return prev.filter(n => n !== nodeName);
      } else {
        return [...prev, nodeName];
      }
    });
  };

  const isConnected = status !== 'disconnected' && status !== 'unknown';

  return (
    <div className="space-y-4">
      {/* Main Control Panel */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5" />
            {t('robots.control_panel_title')}
          </h3>
          <p className="text-red-100 text-sm">{robotName}</p>
          <div className="flex items-center gap-2 mt-2">
            {isConnected ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-200" />
                <span className="text-xs text-green-100">{t('robots.connected_via_ros2')}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-yellow-200" />
                <span className="text-xs text-yellow-100">{t('robots.disconnected')}</span>
              </>
            )}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="p-6">
          {lastCommand && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-800 text-sm">{lastCommand}</p>
            </div>
          )}

          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Conexión Remota</h4>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/devices"
                className="bg-sky-600 text-white py-3 rounded-xl hover:bg-sky-700 transition flex items-center justify-center gap-2 shadow-sm text-sm font-medium"
              >
                <Network className="w-5 h-5" />
                <span>Device SDN</span>
              </a>
              <button
                onClick={() => {
                  setLoadingROS(true);
                  setTimeout(() => {
                    setLoadingROS(false);
                    showToastMsg('ROS2 Bridge Conectado');
                  }, 2000);
                }}
                disabled={loadingROS}
                className="bg-orange-600 text-white py-3 rounded-xl hover:bg-orange-700 transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loadingROS ? <Loader className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5" />}
                <span className="text-sm font-medium">{loadingROS ? 'Iniciando...' : 'Iniciar ROS2'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {/* Emergency Stop */}
            <button
              onClick={handleEmergencyStop}
              disabled={loading || !isConnected}
              className="col-span-3 bg-red-600 text-white py-4 rounded-xl hover:bg-red-700 transition flex items-center justify-center gap-2 font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('robots.emergency_stop_tooltip')}
            >
              <StopCircle className="w-6 h-6" />
              {t('robots.emergency_stop')}
            </button>

            {/* Resume */}
            <button
              onClick={handleResume}
              disabled={loading || !isConnected || status === 'working'}
              className="bg-green-600 text-white py-3 rounded-xl hover:bg-green-700 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-5 h-5" />
              <span className="text-xs">{t('robots.resume')}</span>
            </button>

            {/* Return Home */}
            <button
              disabled={loading || !isConnected}
              className="bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Home className="w-5 h-5" />
              <span className="text-xs">{t('robots.return_home')}</span>
            </button>

            {/* View Logs */}
            <button
              disabled={loading || !isConnected}
              className="bg-gray-600 text-white py-3 rounded-xl hover:bg-gray-700 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-5 h-5" />
              <span className="text-xs">{t('robots.logs')}</span>
            </button>
          </div>

          {/* Camera Stream */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('robots.camera_stream')}</h4>
            <ROS2CameraViewer
              robotId={robotId}
              width={640}
              height={360}
              autoStart={isConnected}
            />
          </div>

          {!isConnected && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-800">
                <p className="font-semibold mb-1">{t('robots.robot_disconnected')}</p>
                <p>{t('robots.robot_disconnected_message')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ROS2 Node Monitor */}
      {isConnected && (
        <ROS2NodeMonitor
          robotId={robotId}
          onNodeSelect={handleNodeSelect}
          selectedNodes={selectedNodes}
        />
      )}

      {/* ROS2 Alerts Panel */}
      {isConnected && (
        <ROS2AlertsPanel
          robotId={robotId}
          autoRefresh={true}
          refreshInterval={5000}
        />
      )}
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl z-50 flex items-center gap-2 animate-bounce-in">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
