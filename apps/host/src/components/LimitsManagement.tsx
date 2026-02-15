import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';

type Limits = {
  planType?: string | null;
  maxUsers?: number | null;
  maxRobots?: number | null;
  maxSensors?: number | null;
  maxAreaHectares?: number | null;
};

const PLAN_TYPES = [
  { value: 'basic', label: 'Basic' },
  { value: 'premium', label: 'Premium' },
  { value: 'enterprise', label: 'Enterprise' },
];

export const LimitsManagement: React.FC = () => {
  const { user } = useAuth();
  const [limits, setLimits] = useState<Limits>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const tenantId = user?.tenant || 'admin';
      
      const res = await api.get('/admin/tenant-limits', {
        params: { tenant_id: tenantId }
      });
      setLimits({
        planType: res.data.planType ?? res.data.plan ?? '',
        maxUsers: res.data.maxUsers ?? res.data.max_users ?? undefined,
        maxRobots: res.data.maxRobots ?? res.data.max_robots ?? undefined,
        maxSensors: res.data.maxSensors ?? res.data.max_sensors ?? undefined,
        maxAreaHectares: res.data.maxAreaHectares ?? res.data.max_area_hectares ?? undefined,
      });
      setMessage(null);
    } catch (e: any) {
      setMessage('Error cargando límites: ' + (e.response?.data?.error || e.message));
      console.error('Error loading limits:', e);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      const tenantId = user?.tenant || 'admin';
      const payload: Limits & { tenant_id?: string } = { tenant_id: tenantId };
      if (limits.planType !== undefined) payload.planType = limits.planType || undefined;
      if (limits.maxUsers !== undefined) payload.maxUsers = Number(limits.maxUsers);
      if (limits.maxRobots !== undefined) payload.maxRobots = Number(limits.maxRobots);
      if (limits.maxSensors !== undefined) payload.maxSensors = Number(limits.maxSensors);
      if (limits.maxAreaHectares !== undefined) payload.maxAreaHectares = Number(limits.maxAreaHectares);
      await api.patch('/admin/tenant-limits', payload);
      setMessage('✅ Límites guardados correctamente');
      setTimeout(() => setMessage(null), 3000);
      await load();
    } catch (e: any) {
      setMessage('Error guardando límites: ' + (e.response?.data?.error || e.message));
      console.error('Error saving limits:', e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Límites del Tenant</h2>
      {message && (
        <div className="mb-4 text-sm text-gray-700">{message}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Tipo de Plan</label>
          <select
            value={limits.planType ?? ''}
            onChange={(e) => setLimits((s) => ({ ...s, planType: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-2"
            disabled={loading}
          >
            <option value="">Seleccionar plan...</option>
            {PLAN_TYPES.map(plan => (
              <option key={plan.value} value={plan.value}>
                {plan.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Máx. Usuarios</label>
          <input
            type="number"
            value={limits.maxUsers ?? ''}
            onChange={(e) => setLimits((s) => ({ ...s, maxUsers: e.target.value === '' ? undefined : Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded px-3 py-2"
            min={0}
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Máx. Robots</label>
          <input
            type="number"
            value={limits.maxRobots ?? ''}
            onChange={(e) => setLimits((s) => ({ ...s, maxRobots: e.target.value === '' ? undefined : Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded px-3 py-2"
            min={0}
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Máx. Sensores</label>
          <input
            type="number"
            value={limits.maxSensors ?? ''}
            onChange={(e) => setLimits((s) => ({ ...s, maxSensors: e.target.value === '' ? undefined : Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded px-3 py-2"
            min={0}
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Máx. Superficie (ha)</label>
          <input
            type="number"
            step="0.01"
            value={limits.maxAreaHectares ?? ''}
            onChange={(e) => setLimits((s) => ({ ...s, maxAreaHectares: e.target.value === '' ? undefined : Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded px-3 py-2"
            min={0}
            disabled={loading}
          />
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          onClick={save}
          disabled={saving || loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="bg-gray-100 text-gray-800 px-4 py-2 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          Recargar
        </button>
      </div>
    </div>
  );
};


