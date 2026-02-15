import React, { useState, useEffect } from 'react';
import { Network, Shield, RefreshCw, AlertCircle, CheckCircle, Power, User, Server } from 'lucide-react';
import api from '@/services/api';
import { useTranslation } from '@nekazari/sdk';

interface TenantVPNStatus {
    tenantId: string;
    tenantName: string; // or email
    plan: string;
    hasService: boolean; // Is VPN service activated for this tenant?
    configured: boolean; // Is WireGuard config generated?
    baseIp?: string;
    subnet?: string;
    assignedIps: string[]; // List of IPs currently assigned
    maxIps: number;
}

export const VPNManager: React.FC = () => {
    const { t } = useTranslation(['admin']);
    const [tenants, setTenants] = useState<TenantVPNStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all tenants
            // Using direct API call as api.getTenants might not exist or be different
            const response = await api.get('/admin/tenants');
            // Check response structure based on AdminPanel usage
            const rawTenants = Array.isArray(response.data) ? response.data :
                (response.data?.tenants || []);

            const results: TenantVPNStatus[] = [];

            // 2. For each tenant, fetch VPN config imporsonating the tenant
            // Note: This is an expensive operation (N calls), but necessary without a specific aggregator endpoint
            for (const tenant of rawTenants) {
                const tenantId = tenant.tenant_id || tenant.id;
                const plan = tenant.plan || 'basic';

                try {
                    // We try to fetch the config passing the X-Tenant-ID header
                    // This assumes the backend honors this header for Admins or we are using an admin endpoint
                    // If not, we might need a dedicated backend endpoint.
                    const configRes = await api.get('/entity-manager/api/vpn/config', {
                        headers: { 'X-Tenant-ID': tenantId }
                    }).catch(() => null);

                    const statusRes = await api.get('/api/tenant/services/vpn/status', {
                        headers: { 'X-Tenant-ID': tenantId }
                    }).catch(() => null);

                    // Determine max IPs
                    let maxIps = 1;
                    const p = plan.toLowerCase();
                    if (p.includes('enterprise')) maxIps = 50;
                    else if (p.includes('premium') || p.includes('advance')) maxIps = 10;

                    // Mock assigned IPs for now if the API doesn't return list (it returns base_ip)
                    // In a real scenario we would need specific endpoint to list all peers
                    const assigned = [];
                    if (configRes?.data?.tenant_base_ip) {
                        assigned.push(configRes.data.tenant_base_ip);
                    }

                    results.push({
                        tenantId: tenantId,
                        tenantName: tenant.company_name || tenant.email || tenantId,
                        plan: plan,
                        hasService: statusRes?.data?.active || false,
                        configured: configRes?.data?.configured || false,
                        baseIp: configRes?.data?.tenant_base_ip,
                        subnet: configRes?.data?.subnet,
                        assignedIps: assigned,
                        maxIps: maxIps
                    });

                } catch (err) {
                    console.warn(`Failed to inspect VPN for tenant ${tenantId}`, err);
                    results.push({
                        tenantId: tenantId,
                        tenantName: tenant.company_name || tenant.email || tenantId,
                        plan: plan,
                        hasService: false,
                        configured: false,
                        assignedIps: [],
                        maxIps: 1
                    });
                }
            }
            setTenants(results);

        } catch (err) {
            console.error('Error loading VPN data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const toggleService = async (tenantId: string, currentStatus: boolean) => {
        if (!confirm(`Are you sure you want to ${currentStatus ? 'DISABLE' : 'ENABLE'} VPN for this tenant?`)) return;

        setProcessing(tenantId);
        try {
            const endpoint = currentStatus
                ? '/api/tenant/services/vpn/deactivate' // Assuming deactivate exists
                : '/api/tenant/services/vpn/activate';

            await api.post(endpoint, {}, { headers: { 'X-Tenant-ID': tenantId } });
            // Refresh single tenant? For now Refresh All
            await loadData();
        } catch (err) {
            alert('Operation failed');
            console.error(err);
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Gestión Global VPN (WireGuard)</h2>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('refresh')}
                </button>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Config</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IPs Usage</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base IP</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tenants.map((t) => (
                            <tr key={t.tenantId}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                                            <User className="h-5 w-5 text-gray-500" />
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{t.tenantName}</div>
                                            <div className="text-sm text-gray-500">{t.tenantId.substring(0, 8)}...</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                        {t.plan}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {t.hasService ? (
                                        <span className="flex items-center text-green-600 text-sm">
                                            <CheckCircle className="h-4 w-4 mr-1" /> Active
                                        </span>
                                    ) : (
                                        <span className="flex items-center text-gray-400 text-sm">
                                            <Power className="h-4 w-4 mr-1" /> Inactive
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {t.configured ? (
                                        <span className="text-sm text-gray-900">Ready</span>
                                    ) : (
                                        <span className="text-sm text-yellow-600">Pending</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-1 h-2 bg-gray-200 rounded-full w-24 mr-2">
                                            <div
                                                className={`h-2 rounded-full ${t.assignedIps.length >= t.maxIps ? 'bg-red-500' : 'bg-green-500'}`}
                                                style={{ width: `${(t.assignedIps.length / t.maxIps) * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-xs text-gray-600">{t.assignedIps.length}/{t.maxIps}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                                    {t.baseIp || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => toggleService(t.tenantId, t.hasService)}
                                        disabled={processing === t.tenantId}
                                        className={`text-indigo-600 hover:text-indigo-900 ${t.hasService ? 'text-red-600 hover:text-red-900' : ''}`}
                                    >
                                        {processing === t.tenantId ? 'Processing...' : (t.hasService ? 'Deactivate' : 'Activate')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
