import React, { useState } from 'react';
import { X, Copy, Check, Shield, Server, Wifi } from 'lucide-react';

export interface RobotCredentials {
  robot_uuid: string;
  ros_namespace: string;
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

  const CredentialField: React.FC<{ label: string; value: string; fieldName: string }> = ({ label, value, fieldName }) => (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
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
          {copiedField === fieldName
            ? <Check className="w-4 h-4 text-green-600" />
            : <Copy className="w-4 h-4" />
          }
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 flex justify-between items-start rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Robot Created</h2>
              <p className="text-sm text-green-100">
                <span className="font-semibold">{robotName}</span> is ready
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Robot info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-gray-500" />
              <h4 className="font-medium text-gray-700">Robot Identity</h4>
            </div>
            <div className="space-y-2">
              <CredentialField label="Robot UUID" value={credentials.robot_uuid} fieldName="uuid" />
              <CredentialField label="ROS Namespace" value={credentials.ros_namespace} fieldName="ros_namespace" />
            </div>
          </div>

          {/* Network provisioning notice */}
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="w-4 h-4 text-sky-600" />
              <h4 className="font-medium text-sky-900">Network Access (Headscale SDN)</h4>
            </div>
            <p className="text-sm text-sky-800">
              Network access is provisioned separately via the{' '}
              <a href="/devices" className="font-semibold underline hover:text-sky-600">
                Device Management
              </a>{' '}
              page using the Claim Code printed on the device chassis.
            </p>
            <ol className="text-sm text-sky-800 space-y-1 list-decimal list-inside mt-2">
              <li>Go to <strong>Device Management → Add Device</strong></li>
              <li>Enter the device UUID and the Claim Code from the chassis label</li>
              <li>For rovers/gateways: a Tailscale Pre-Auth Key will be generated</li>
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
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
