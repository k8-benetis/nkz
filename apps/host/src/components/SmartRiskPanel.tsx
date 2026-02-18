import React, { useState, useEffect } from 'react';
import { Mail, Smartphone, AlertTriangle, Sliders, Loader2 } from 'lucide-react';
import api from '@/services/api';
import { RiskCatalog, RiskSubscription } from '@/types';

export const SmartRiskPanel: React.FC = () => {
  const [catalog, setCatalog] = useState<RiskCatalog[]>([]);
  const [subscriptions, setSubscriptions] = useState<Map<string, RiskSubscription>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Load catalog and subscriptions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [catalogData, subscriptionsData] = await Promise.all([
          api.getRiskCatalog(),
          api.getRiskSubscriptions()
        ]);
        
        setCatalog(catalogData);
        
        // Convert subscriptions array to Map for easy lookup
        const subscriptionsMap = new Map<string, RiskSubscription>();
        subscriptionsData.forEach(sub => {
          subscriptionsMap.set(sub.risk_code, sub);
        });
        setSubscriptions(subscriptionsMap);
      } catch (error) {
        console.error('Error loading risk data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const getSubscription = (riskCode: string): RiskSubscription | null => {
    return subscriptions.get(riskCode) || null;
  };

  const isActive = (riskCode: string): boolean => {
    const sub = getSubscription(riskCode);
    return sub?.is_active ?? false;
  };

  const getThreshold = (riskCode: string): number => {
    const sub = getSubscription(riskCode);
    return sub?.user_threshold ?? 50;
  };

  const getChannels = (riskCode: string): { email: boolean; push: boolean } => {
    const sub = getSubscription(riskCode);
    return sub?.notification_channels ?? { email: true, push: false };
  };

  const toggleSubscription = async (riskCode: string) => {
    const currentSub = getSubscription(riskCode);
    const isCurrentlyActive = currentSub?.is_active ?? false;

    try {
      setSaving(prev => ({ ...prev, [riskCode]: true }));

      if (isCurrentlyActive && currentSub) {
        // Deactivate subscription
        await api.updateRiskSubscription(currentSub.id, { is_active: false });
        const updatedSub = { ...currentSub, is_active: false };
        setSubscriptions(prev => {
          const newMap = new Map(prev);
          newMap.set(riskCode, updatedSub);
          return newMap;
        });
      } else {
        // Create or activate subscription
        if (currentSub) {
          // Reactivate existing subscription
          await api.updateRiskSubscription(currentSub.id, { is_active: true });
          const updatedSub = { ...currentSub, is_active: true };
          setSubscriptions(prev => {
            const newMap = new Map(prev);
            newMap.set(riskCode, updatedSub);
            return newMap;
          });
        } else {
          // Create new subscription
          const newSub = await api.createRiskSubscription({
            risk_code: riskCode,
            is_active: true,
            user_threshold: 50,
            notification_channels: { email: true, push: false },
            entity_filters: {}
          });
          setSubscriptions(prev => {
            const newMap = new Map(prev);
            newMap.set(riskCode, newSub);
            return newMap;
          });
        }
      }
    } catch (error) {
      console.error(`Error toggling subscription for ${riskCode}:`, error);
    } finally {
      setSaving(prev => ({ ...prev, [riskCode]: false }));
    }
  };

  const updateThreshold = async (riskCode: string, value: number) => {
    const currentSub = getSubscription(riskCode);
    if (!currentSub) return;

    try {
      setSaving(prev => ({ ...prev, [riskCode]: true }));
      const updatedSub = await api.updateRiskSubscription(currentSub.id, {
        user_threshold: Math.max(0, Math.min(100, value))
      });
      setSubscriptions(prev => {
        const newMap = new Map(prev);
        newMap.set(riskCode, updatedSub);
        return newMap;
      });
    } catch (error) {
      console.error(`Error updating threshold for ${riskCode}:`, error);
    } finally {
      setSaving(prev => ({ ...prev, [riskCode]: false }));
    }
  };

  const toggleChannel = async (riskCode: string, channel: 'email' | 'push') => {
    const currentSub = getSubscription(riskCode);
    if (!currentSub) return;

    try {
      setSaving(prev => ({ ...prev, [riskCode]: true }));
      const currentChannels = getChannels(riskCode);
      const updatedChannels = {
        ...currentChannels,
        [channel]: !currentChannels[channel]
      };
      
      const updatedSub = await api.updateRiskSubscription(currentSub.id, {
        notification_channels: updatedChannels
      });
      setSubscriptions(prev => {
        const newMap = new Map(prev);
        newMap.set(riskCode, updatedSub);
        return newMap;
      });
    } catch (error) {
      console.error(`Error updating channel for ${riskCode}:`, error);
    } finally {
      setSaving(prev => ({ ...prev, [riskCode]: false }));
    }
  };

  const getRiskDomainIcon = (domain: string) => {
    switch (domain) {
      case 'agronomic':
        return '🌾';
      case 'robotic':
        return '🤖';
      case 'energy':
        return '⚡';
      case 'livestock':
        return '🐄';
      default:
        return '⚠️';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <span className="ml-3 text-gray-600">Cargando catálogo de riesgos...</span>
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No hay riesgos disponibles en el catálogo.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Sliders className="h-5 w-5 text-purple-600" />
          Configuración de Riesgos Inteligentes
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Activa los riesgos que deseas monitorear y define tus umbrales de alerta.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {catalog.map((risk) => {
          const isActiveSubscription = isActive(risk.risk_code);
          const threshold = getThreshold(risk.risk_code);
          const riskChannels = getChannels(risk.risk_code);
          const isSaving = saving[risk.risk_code] ?? false;

          return (
            <div key={risk.risk_code} className={`p-6 transition-colors ${isActiveSubscription ? 'bg-purple-50/30' : 'bg-white'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`p-3 rounded-lg ${isActiveSubscription ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                    <span className="text-2xl">{getRiskDomainIcon(risk.risk_domain)}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{risk.risk_name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {risk.risk_domain}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{risk.risk_description}</p>
                    <div className="mt-2 text-xs text-gray-400">
                      Tipo: {risk.target_sdm_type}
                      {risk.target_subtype && ` • ${risk.target_subtype}`}
                    </div>

                    {isActiveSubscription && (
                      <div className="mt-4 flex items-center gap-6 flex-wrap">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">Umbral:</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={threshold}
                            onChange={(e) => updateThreshold(risk.risk_code, Number(e.target.value))}
                            disabled={isSaving}
                            className="w-20 text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleChannel(risk.risk_code, 'email')}
                            disabled={isSaving}
                            className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                              riskChannels.email ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                            }`}
                            title="Notificar por Email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleChannel(risk.risk_code, 'push')}
                            disabled={isSaving}
                            className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                              riskChannels.push ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                            }`}
                            title="Notificar por Push"
                          >
                            <Smartphone className="h-4 w-4" />
                          </button>
                        </div>
                        {isSaving && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => toggleSubscription(risk.risk_code)}
                  disabled={isSaving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                    isActiveSubscription ? 'bg-purple-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isActiveSubscription ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
