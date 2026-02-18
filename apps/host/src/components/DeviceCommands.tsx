// =============================================================================
// Device Commands Component - Envío de comandos bidireccionales
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Send, History, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';

interface Command {
  id: string;
  command_type: string;
  payload: Record<string, any>;
  status: 'pending' | 'sent' | 'executed' | 'failed';
  sent_at: string;
  executed_at?: string;
  response?: Record<string, any>;
}

interface DeviceCommandsProps {
  deviceId: string;
  deviceName: string;
  mqttTopics?: {
    commands: string;
  };
}

export const DeviceCommands: React.FC<DeviceCommandsProps> = ({
  deviceId,
  deviceName: _deviceName,
  mqttTopics
}) => {
  const { t } = useI18n();
  const [commandHistory, setCommandHistory] = useState<Command[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [commandType, setCommandType] = useState('custom');
  const [commandPayload, setCommandPayload] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Comandos predefinidos comunes
  const predefinedCommands = [
    { type: 'reboot', label: t('sensors.command_reboot') || 'Reiniciar dispositivo', payload: { action: 'reboot' } },
    { type: 'reset', label: t('sensors.command_reset') || 'Reset de fábrica', payload: { action: 'factory_reset' } },
    { type: 'calibrate', label: t('sensors.command_calibrate') || 'Calibrar sensores', payload: { action: 'calibrate' } },
    { type: 'update_firmware', label: t('sensors.command_update_firmware') || 'Actualizar firmware', payload: { action: 'update_firmware' } },
    { type: 'get_status', label: t('sensors.command_get_status') || 'Obtener estado', payload: { action: 'get_status' } },
    { type: 'custom', label: t('sensors.command_custom') || 'Comando personalizado', payload: {} }
  ];

  useEffect(() => {
    loadCommandHistory();
  }, [deviceId]);

  const loadCommandHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await api.getDeviceCommands(deviceId);
      if (data && data.commands) {
        setCommandHistory(data.commands);
      }
    } catch (err: any) {
      console.error('Error loading command history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSendCommand = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let payload: Record<string, any>;
      
      if (commandType === 'custom') {
        try {
          payload = JSON.parse(commandPayload);
        } catch (e) {
          setError(t('sensors.invalid_json') || 'JSON inválido');
          setIsLoading(false);
          return;
        }
      } else {
        const cmd = predefinedCommands.find(c => c.type === commandType);
        payload = cmd?.payload || {};
      }

      await api.sendDeviceCommand(deviceId, {
        command_type: commandType,
        payload: payload
      });

      setSuccess(t('sensors.command_sent') || 'Comando enviado correctamente');
      setCommandPayload('{}');
      
      // Recargar historial después de un breve delay
      setTimeout(() => {
        loadCommandHistory();
      }, 1000);

    } catch (err: any) {
      console.error('Error sending command:', err);
      setError(err?.response?.data?.error || t('sensors.command_error') || 'Error al enviar comando');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'sent':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-4">
      {/* Panel de envío de comandos */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t('sensors.send_command') || 'Enviar Comando'}
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            <span className="text-green-700 text-sm">{success}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('sensors.command_type') || 'Tipo de Comando'}
            </label>
            <select
              value={commandType}
              onChange={(e) => {
                setCommandType(e.target.value);
                const cmd = predefinedCommands.find(c => c.type === e.target.value);
                if (cmd && cmd.type !== 'custom') {
                  setCommandPayload(JSON.stringify(cmd.payload, null, 2));
                } else {
                  setCommandPayload('{}');
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {predefinedCommands.map(cmd => (
                <option key={cmd.type} value={cmd.type}>{cmd.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('sensors.command_payload') || 'Payload (JSON)'}
            </label>
            <textarea
              value={commandPayload}
              onChange={(e) => setCommandPayload(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder='{"action": "reboot", "delay": 5}'
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('sensors.command_payload_hint') || 'Ingresa el payload del comando en formato JSON'}
            </p>
          </div>

          {mqttTopics && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>{t('sensors.mqtt_topic_commands') || 'Topic MQTT:'}</strong> {mqttTopics.commands}
              </p>
            </div>
          )}

          <button
            onClick={handleSendCommand}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('sensors.sending') || 'Enviando...'}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{t('sensors.send_command') || 'Enviar Comando'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Historial de comandos */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5" />
            {t('sensors.command_history') || 'Historial de Comandos'}
          </h3>
          <button
            onClick={loadCommandHistory}
            disabled={isLoadingHistory}
            className="p-2 text-gray-600 hover:text-gray-900 transition disabled:opacity-50"
            title={t('sensors.refresh') || 'Actualizar'}
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="text-center py-8 text-gray-500">
            {t('sensors.loading') || 'Cargando...'}
          </div>
        ) : commandHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('sensors.no_commands') || 'No hay comandos enviados'}
          </div>
        ) : (
          <div className="space-y-2">
            {commandHistory.map((cmd) => (
              <div
                key={cmd.id}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(cmd.status)}
                      <span className="font-medium text-gray-900">{cmd.command_type}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        cmd.status === 'executed' ? 'bg-green-100 text-green-700' :
                        cmd.status === 'sent' ? 'bg-yellow-100 text-yellow-700' :
                        cmd.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {cmd.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      {formatTimestamp(cmd.sent_at)}
                      {cmd.executed_at && ` • Ejecutado: ${formatTimestamp(cmd.executed_at)}`}
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                        {t('sensors.view_payload') || 'Ver payload'}
                      </summary>
                      <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto">
                        {JSON.stringify(cmd.payload, null, 2)}
                      </pre>
                      {cmd.response && (
                        <>
                          <p className="mt-2 font-medium">{t('sensors.response') || 'Respuesta:'}</p>
                          <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto">
                            {JSON.stringify(cmd.response, null, 2)}
                          </pre>
                        </>
                      )}
                    </details>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

