// =============================================================================
// Dynamic Robot Control Panel - Panel de Control Dinámico basado en Capabilities
// =============================================================================
// Lee capabilities de FIWARE y renderiza controles dinámicamente
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  AlertTriangle,
  CheckCircle,
  Loader
} from 'lucide-react';
import { Ros, Topic, Message, Service, ServiceRequest, ActionClient, Goal } from 'roslib';
import { Robot, RobotCapabilities } from '@/types';
import { getConfig } from '@/config/environment';
import { useI18n } from '@/context/I18nContext';

interface DynamicRobotControlPanelProps {
  robot: Robot;
  robotId: string;
}

export const DynamicRobotControlPanel: React.FC<DynamicRobotControlPanelProps> = ({
  robot,
  robotId
}) => {
  const { t } = useI18n();
  const [capabilities, setCapabilities] = useState<RobotCapabilities | null>(null);
  const [rosConnected, setRosConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const rosRef = useRef<Ros | null>(null);
  const cmdVelPublisherRef = useRef<Topic | null>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickManagerRef = useRef<{ destroy: () => void } | null>(null);

  const config = getConfig();
  const ros2BridgeUrl = config.external?.ros2BridgeUrl || `wss://${window.location.host}/ros2-bridge`;

  // Extraer capabilities de la entidad Robot
  useEffect(() => {
    if (robot.capabilities) {
      const capsValue = robot.capabilities.value;
      if (typeof capsValue === 'object' && !Array.isArray(capsValue)) {
        setCapabilities(capsValue as RobotCapabilities);
      }
    }
  }, [robot]);

  // Conectar a ROS2 Web Bridge
  useEffect(() => {
    if (!capabilities || !capabilities.teleoperation) {
      return; // Solo conectar si hay teleoperación
    }

    try {
      const ros = new Ros({
        url: ros2BridgeUrl
      });

      ros.on('connection', () => {
        console.log('Connected to ROS2 Web Bridge');
        setRosConnected(true);
        setError(null);

        // Crear publisher para cmd_vel si hay teleoperación
        if (capabilities.teleoperation) {
          cmdVelPublisherRef.current = new Topic({
            ros: ros,
            name: capabilities.teleoperation.topic,
            messageType: capabilities.teleoperation.type || 'geometry_msgs/msg/Twist'
          });
        }
      });

      ros.on('error', (err: Error) => {
        console.error('ROS2 Web Bridge error:', err);
        setError(t('robots.ros2_connection_error', { message: err.message }));
        setRosConnected(false);
      });

      ros.on('close', () => {
        console.log('Disconnected from ROS2 Web Bridge');
        setRosConnected(false);
      });

      rosRef.current = ros;

      return () => {
        if (rosRef.current) {
          rosRef.current.close();
        }
      };
    } catch (err: any) {
      console.error('Error initializing ROS2 connection:', err);
      setError(t('robots.ros2_init_error', { message: err.message }));
    }
  }, [capabilities, ros2BridgeUrl]);

  // Inicializar joystick
  useEffect(() => {
    if (!capabilities?.teleoperation || !rosConnected || !joystickRef.current) {
      return;
    }

    // Importar nipplejs dinámicamente
    import('nipplejs').then((nipplejs) => {
      if (!joystickRef.current) return;

      const manager = nipplejs.default.create({
        zone: joystickRef.current,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'blue',
        size: 150
      });

      manager.on('move', (_evt: unknown, data: { force: number; direction?: { y: string }; angle: { radian: number } }) => {
        if (!cmdVelPublisherRef.current) return;

        // Convertir coordenadas del joystick a Twist
        const linear = Math.max(0, Math.min(1, data.force)) * (data.direction?.y === 'up' ? 1 : -1);
        const angular = data.angle.radian - Math.PI / 2;

        const twist = new Message({
          linear: {
            x: linear * 0.5, // Velocidad máxima 0.5 m/s
            y: 0,
            z: 0
          },
          angular: {
            x: 0,
            y: 0,
            z: angular * 0.5 // Velocidad angular máxima 0.5 rad/s
          }
        });

        cmdVelPublisherRef.current.publish(twist);
      });

      manager.on('end', () => {
        if (!cmdVelPublisherRef.current) return;

        // Detener robot cuando se suelta el joystick
        const twist = new Message({
          linear: { x: 0, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: 0 }
        });

        cmdVelPublisherRef.current.publish(twist);
      });

      joystickManagerRef.current = manager;

      return () => {
        if (joystickManagerRef.current) {
          joystickManagerRef.current.destroy();
        }
      };
    });
  }, [capabilities?.teleoperation, rosConnected]);

  const callService = async (serviceName: string, serviceType: string, request: any = {}) => {
    if (!rosRef.current) {
      setError(t('robots.not_connected_ros2'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const service = new Service({
        ros: rosRef.current,
        name: serviceName,
        serviceType: serviceType
      });

      const serviceRequest = new ServiceRequest(request);

      return new Promise((resolve, reject) => {
        service.callService(serviceRequest, (response: any) => {
          setLoading(false);
          if (response.success !== false) {
            setLastCommand(t('robots.service_executed', { serviceName }));
            setTimeout(() => setLastCommand(null), 3000);
            resolve(response);
          } else {
            const errorMsg = t('robots.service_error', { 
              serviceName, 
              message: response.message || t('robots.unknown_error') 
            });
            setError(errorMsg);
            reject(new Error(errorMsg));
          }
        });
      });
    } catch (err: any) {
      setLoading(false);
      setError(t('robots.service_call_error', { message: err.message }));
      throw err;
    }
  };

  const callAction = async (actionName: string, actionType: string, goal: any = {}) => {
    if (!rosRef.current) {
      setError(t('robots.not_connected_ros2'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const actionClient = new ActionClient({
        ros: rosRef.current,
        serverName: actionName,
        actionName: actionType
      });

      const goalMessage = new Goal({
        actionClient: actionClient,
        goalMessage: goal
      });

      goalMessage.on('feedback', (feedback: any) => {
        console.log('Action feedback:', feedback);
      });

      goalMessage.on('result', (_result: any) => {
        setLoading(false);
        setLastCommand(t('robots.action_completed', { actionName }));
        setTimeout(() => setLastCommand(null), 3000);
      });

      goalMessage.on('status', (status: any) => {
        console.log('Action status:', status);
      });

      goalMessage.send();

      return goalMessage;
    } catch (err: any) {
      setLoading(false);
      setError(t('robots.action_start_error', { message: err.message }));
      throw err;
    }
  };

  const isOnline = robot.status?.value === 'online' || robot.status?.value === 'connected';

  // Si no hay capabilities, usar panel básico
  if (!capabilities) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-gray-500 to-gray-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5" />
            {t('robots.basic_control_title')}
          </h3>
          <p className="text-gray-100 text-sm">{robot.name?.value || robotId}</p>
        </div>
        <div className="p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">
              {t('robots.no_capabilities_message')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Control Panel */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-r px-6 py-4 ${isOnline ? 'from-green-500 to-green-600' : 'from-red-500 to-red-600'}`}>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5" />
            {t('robots.dynamic_control_title')}
          </h3>
          <p className="text-white/90 text-sm">{robot.name?.value || robotId}</p>
          <div className="flex items-center gap-2 mt-2">
            {isOnline ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-200" />
                <span className="text-xs text-green-100">{t('robots.online')}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-yellow-200" />
                <span className="text-xs text-yellow-100">{t('robots.offline')}</span>
              </>
            )}
            {rosConnected && (
              <>
                <CheckCircle className="w-4 h-4 text-blue-200" />
                <span className="text-xs text-blue-100">{t('robots.ros2_connected')}</span>
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

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Services */}
          {capabilities.services && capabilities.services.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('robots.services')}</h4>
              <div className="grid grid-cols-2 gap-3">
                {capabilities.services.map((service, idx) => (
                  <button
                    key={idx}
                    onClick={() => callService(service.service, service.type)}
                    disabled={loading || !isOnline || !rosConnected}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>{service.name}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {capabilities.actions && capabilities.actions.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('robots.actions')}</h4>
              <div className="grid grid-cols-2 gap-3">
                {capabilities.actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => callAction(action.action, action.type)}
                    disabled={loading || !isOnline || !rosConnected}
                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>{action.name}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Teleoperation Joystick */}
          {capabilities.teleoperation && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('robots.teleoperation')}</h4>
              <div className="bg-gray-100 rounded-lg p-6 flex items-center justify-center">
                {rosConnected ? (
                  <div
                    ref={joystickRef}
                    className="w-64 h-64 relative bg-white rounded-full border-4 border-gray-300"
                  />
                ) : (
                  <div className="text-center">
                    <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">{t('robots.connecting_ros2')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isOnline && (
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
    </div>
  );
};

