import React, { useState } from 'react';
import { X, Copy, Check, Download, AlertTriangle, Shield, Wifi, Server, Key, FileDown } from 'lucide-react';

export interface RobotCredentials {
  robot_uuid: string;
  ros_namespace: string;
  vpn_ip: string;
  wireguard_private_key: string;
  wireguard_public_key: string;
  server_endpoint: string;
  server_public_key: string;
}

interface RobotCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  robotName: string;
  credentials: RobotCredentials;
}

export const RobotCredentialsModal: React.FC<RobotCredentialsModalProps> = ({
  isOpen,
  onClose,
  robotName,
  credentials
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const downloadWireGuardConfig = () => {
    const config = `[Interface]
PrivateKey = ${credentials.wireguard_private_key}
Address = ${credentials.vpn_ip}/24

[Peer]
PublicKey = ${credentials.server_public_key}
Endpoint = ${credentials.server_endpoint}
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
`;

    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wireguard-${robotName.replace(/\s+/g, '-')}.conf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const CredentialField: React.FC<{
    label: string;
    value: string;
    fieldName: string;
    sensitive?: boolean;
  }> = ({ label, value, fieldName, sensitive = false }) => (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={sensitive ? 'password' : 'text'}
          value={value}
          readOnly
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50 font-mono"
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

  const [allCopied, setAllCopied] = useState(false);

  const copyAllCredentials = () => {
    const text = `Robot Credentials for ${robotName}
========================================
Robot UUID: ${credentials.robot_uuid}
ROS Namespace: ${credentials.ros_namespace}
VPN IP: ${credentials.vpn_ip}

WireGuard Configuration:
------------------------
Private Key: ${credentials.wireguard_private_key}
Public Key: ${credentials.wireguard_public_key}
Server Endpoint: ${credentials.server_endpoint}
Server Public Key: ${credentials.server_public_key}
`;
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 flex justify-between items-start rounded-t-2xl">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Robot Creado Exitosamente</h2>
            </div>
            <p className="text-sm text-green-100">
              Robot <span className="font-semibold">{robotName}</span> configurado y listo para conectar
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
              <strong>Importante:</strong> Guarda estas credenciales de forma segura. La clave privada NO se mostrará de nuevo.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={downloadWireGuardConfig}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium shadow-sm"
            >
              <FileDown className="w-5 h-5" />
              Descargar .conf
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
                  Copiado!
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
            {/* Robot Info Section */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-gray-500" />
                <h4 className="font-medium text-gray-700">Información del Robot</h4>
              </div>
              <div className="space-y-2">
                <CredentialField label="Robot UUID" value={credentials.robot_uuid} fieldName="uuid" />
                <CredentialField label="ROS Namespace" value={credentials.ros_namespace} fieldName="ros_namespace" />
              </div>
            </div>

            {/* VPN Section */}
            <div className="bg-indigo-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wifi className="w-4 h-4 text-indigo-600" />
                <h4 className="font-medium text-indigo-900">Configuración VPN (WireGuard)</h4>
              </div>
              <div className="space-y-2">
                <CredentialField label="VPN IP" value={credentials.vpn_ip} fieldName="vpn_ip" />
                <CredentialField label="Server Endpoint" value={credentials.server_endpoint} fieldName="server_endpoint" />
              </div>
            </div>

            {/* Keys Section */}
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-4 h-4 text-red-600" />
                <h4 className="font-medium text-red-900">Claves de Encriptación</h4>
                <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">Sensible</span>
              </div>
              <div className="space-y-2">
                <CredentialField label="Private Key (Robot)" value={credentials.wireguard_private_key} fieldName="private_key" sensitive />
                <CredentialField label="Public Key (Robot)" value={credentials.wireguard_public_key} fieldName="public_key" />
                <CredentialField label="Public Key (Server)" value={credentials.server_public_key} fieldName="server_public_key" />
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-medium text-blue-900 mb-2">Próximos pasos:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Descarga el archivo <code className="bg-blue-100 px-1 rounded">.conf</code> de WireGuard</li>
              <li>Cópialo al robot en <code className="bg-blue-100 px-1 rounded">/etc/wireguard/wg0.conf</code></li>
              <li>Ejecuta <code className="bg-blue-100 px-1 rounded">wg-quick up wg0</code></li>
              <li>Configura el namespace ROS2: <code className="bg-blue-100 px-1 rounded">export ROS_NAMESPACE={credentials.ros_namespace}</code></li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium"
          >
            He guardado las credenciales
          </button>
        </div>
      </div>
    </div>
  );
};
