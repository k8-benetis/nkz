/**
 * MqttCredentialsModal - Modal for displaying MQTT credentials after IoT device provisioning
 * 
 * SECURITY: These credentials are shown ONLY ONCE at creation time.
 * The API Key cannot be retrieved later.
 */

import React, { useState } from 'react';
import { X, Copy, Check, AlertTriangle, Wifi, Server, Key, FileDown, Radio, Zap } from 'lucide-react';

export interface MqttCredentials {
  host: string;
  port: number;
  protocol: string;
  api_key: string;
  device_id: string;
  topics: {
    publish_data: string;
    publish_data_json?: string;
    commands: string;
  };
  example_payload?: Record<string, number>;
  warning?: string;
}

interface MqttCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  credentials: MqttCredentials;
}

export const MqttCredentialsModal: React.FC<MqttCredentialsModalProps> = ({
  isOpen,
  onClose,
  deviceName,
  credentials
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const downloadConfigFile = () => {
    const config = {
      device_name: deviceName,
      device_id: credentials.device_id,
      mqtt: {
        host: credentials.host,
        port: credentials.port,
        protocol: credentials.protocol,
        api_key: credentials.api_key,
        topics: credentials.topics
      },
      example_payload: credentials.example_payload || {
        temperature: 22.5,
        humidity: 65,
        batteryLevel: 85
      },
      created_at: new Date().toISOString(),
      notes: [
        "API Key is required for authentication",
        "Publish sensor data to the 'publish_data' or 'publish_data_json' topic",
        "Listen for commands on the 'commands' topic",
        "Use JSON format for all payloads"
      ]
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `device-config-${credentials.device_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyAllCredentials = () => {
    const text = `IoT Device Configuration for ${deviceName}
========================================
Device ID: ${credentials.device_id}
API Key: ${credentials.api_key}

MQTT Connection:
----------------
Host: ${credentials.host}
Port: ${credentials.port}
Protocol: ${credentials.protocol}

Topics:
-------
Publish Data: ${credentials.topics.publish_data}
${credentials.topics.publish_data_json ? `Publish JSON: ${credentials.topics.publish_data_json}` : ''}
Commands: ${credentials.topics.commands}

Example Payload (JSON):
-----------------------
${JSON.stringify(credentials.example_payload || { temperature: 22.5, humidity: 65 }, null, 2)}
`;
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 3000);
  };

  const CredentialField: React.FC<{
    label: string;
    value: string;
    fieldName: string;
    sensitive?: boolean;
    mono?: boolean;
  }> = ({ label, value, fieldName, sensitive = false, mono = true }) => (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={sensitive ? 'password' : 'text'}
          value={value}
          readOnly
          className={`flex-1 px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50 ${mono ? 'font-mono' : ''}`}
        />
        <button
          type="button"
          onClick={() => copyToClipboard(value, fieldName)}
          className="px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
          title="Copy to clipboard"
        >
          {copiedField === fieldName ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-6 py-5 flex justify-between items-start rounded-t-2xl">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Sensor IoT Provisionado</h2>
            </div>
            <p className="text-sm text-teal-100">
              Dispositivo <span className="font-semibold">{deviceName}</span> configurado y listo para enviar datos
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white ml-4 p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <strong>⚠️ IMPORTANTE:</strong> Guarda la API Key ahora. <strong>NO podrás verla después.</strong>
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={downloadConfigFile}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition font-medium shadow-sm"
            >
              <FileDown className="w-5 h-5" />
              Descargar Config JSON
            </button>
            <button
              type="button"
              onClick={copyAllCredentials}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition font-medium shadow-sm ${
                allCopied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {allCopied ? (
                <>
                  <Check className="w-5 h-5" />
                  ¡Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copiar Todo
                </>
              )}
            </button>
          </div>

          {/* Credentials Sections */}
          <div className="space-y-4">
            {/* API Key Section - MOST IMPORTANT */}
            <div className="bg-red-50 rounded-xl p-4 border-2 border-red-300">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-5 h-5 text-red-600" />
                <h4 className="font-bold text-red-900">API Key (Secreto)</h4>
                <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">Una sola vez</span>
              </div>
              <CredentialField 
                label="API Key para autenticación MQTT" 
                value={credentials.api_key} 
                fieldName="api_key" 
              />
            </div>

            {/* Device Info Section */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-gray-500" />
                <h4 className="font-medium text-gray-700">Información del Dispositivo</h4>
              </div>
              <div className="space-y-2">
                <CredentialField label="Device ID" value={credentials.device_id} fieldName="device_id" />
              </div>
            </div>

            {/* MQTT Connection Section */}
            <div className="bg-teal-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wifi className="w-4 h-4 text-teal-600" />
                <h4 className="font-medium text-teal-900">Conexión MQTT</h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CredentialField label="Host" value={credentials.host} fieldName="host" />
                <CredentialField label="Puerto" value={String(credentials.port)} fieldName="port" />
              </div>
              <div className="mt-2 text-xs text-teal-700">
                Protocolo: <code className="bg-teal-100 px-1 rounded">{credentials.protocol}</code>
              </div>
            </div>

            {/* Topics Section */}
            <div className="bg-indigo-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-indigo-600" />
                <h4 className="font-medium text-indigo-900">Topics MQTT</h4>
              </div>
              <div className="space-y-2">
                <CredentialField 
                  label="Enviar Datos (publish)" 
                  value={credentials.topics.publish_data} 
                  fieldName="topic_data" 
                />
                {credentials.topics.publish_data_json && (
                  <CredentialField 
                    label="Enviar Datos JSON" 
                    value={credentials.topics.publish_data_json} 
                    fieldName="topic_json" 
                  />
                )}
                <CredentialField 
                  label="Recibir Comandos" 
                  value={credentials.topics.commands} 
                  fieldName="topic_cmd" 
                />
              </div>
            </div>

            {/* Example Payload */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-gray-500" />
                <h4 className="font-medium text-gray-700">Ejemplo de Payload JSON</h4>
              </div>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm overflow-x-auto">
{JSON.stringify(credentials.example_payload || { 
  temperature: 22.5, 
  humidity: 65, 
  batteryLevel: 85 
}, null, 2)}
              </pre>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-medium text-blue-900 mb-2">Próximos pasos:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Descarga el archivo de configuración JSON</li>
              <li>Configura tu dispositivo con la API Key y los topics</li>
              <li>Conecta por MQTT a <code className="bg-blue-100 px-1 rounded">{credentials.host}:{credentials.port}</code></li>
              <li>Envía datos al topic de publicación en formato JSON</li>
              <li>Verifica en el visor que los datos aparecen correctamente</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition font-medium"
          >
            He guardado las credenciales
          </button>
        </div>
      </div>
    </div>
  );
};

