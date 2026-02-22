import React from 'react';
import { Wifi, ExternalLink } from 'lucide-react';

/**
 * VPN/SDN management panel.
 *
 * WireGuard-based VPN has been replaced by Headscale (Tailscale SDN).
 * Device provisioning is now handled via the nkz-module-vpn Device Management page.
 */
export const VPNManager: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Device Network (Headscale SDN)</h2>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Wifi className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sky-900 mb-1">
                            Managed via Device Management Module
                        </h3>
                        <p className="text-sm text-sky-800 mb-4">
                            Field device network provisioning (rovers, gateways, ESP32 sensors) is now
                            handled through the Device Management module using Zero-Touch Provisioning
                            and Headscale SDN — no manual WireGuard configuration required.
                        </p>
                        <a
                            href="/devices"
                            className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-700 transition"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Go to Device Management
                        </a>
                    </div>
                </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Migration note</p>
                <p>
                    WireGuard-based VPN was removed on 2026-02-21 and replaced by Headscale (open-source
                    Tailscale control plane). Existing devices need to be re-provisioned via Claim Code
                    using the Device Management module.
                </p>
            </div>
        </div>
    );
};

export default VPNManager;
