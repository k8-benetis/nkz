
import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Zap, HelpCircle, CloudSun, ToggleLeft, ToggleRight,
  Search, Settings2, BellRing, Loader2
} from 'lucide-react';
import api from '@/services/api';
import { RISK_CATALOG, RiskCategory } from '@/config/riskCatalog';
import { RiskSubscription } from '@/types';

export const SmartRiskPanel: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<RiskCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [subscriptions, setSubscriptions] = useState<Map<string, RiskSubscription>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [availableSensors, setAvailableSensors] = useState<Record<string, 'iot' | 'virtual'>>({});

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [subsData, entitySummary] = await Promise.all([
          api.getRiskSubscriptions(),
          fetch('/api/modules/entities/summary').then(res => res.ok ? res.json() : { attributes: [] })
        ]);

        // Map subscriptions
        const subsMap = new Map<string, RiskSubscription>();
        subsData.forEach((sub: RiskSubscription) => {
          subsMap.set(sub.risk_code, sub);
        });
        setSubscriptions(subsMap);

        // Map sensors
        const sensors: Record<string, 'iot' | 'virtual'> = {};
        const iotAttrs = entitySummary.attributes || [];
        const allParams = Array.from(new Set(RISK_CATALOG.flatMap(r => r.params)));
        allParams.forEach(p => {
          sensors[p] = iotAttrs.includes(p) ? 'iot' : 'virtual';
        });
        setAvailableSensors(sensors);

      } catch (err) {
        console.error('Error fetching risk panel data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleToggleRisk = async (riskId: string) => {
    const currentSub = subscriptions.get(riskId);
    const isActive = currentSub?.is_active ?? false;
    
    setSaving(prev => ({ ...prev, [riskId]: true }));
    try {
      if (currentSub) {
        // Toggle existing
        const updated = await api.updateRiskSubscription(currentSub.id, { is_active: !isActive });
        setSubscriptions(prev => {
          const newMap = new Map(prev);
          newMap.set(riskId, updated);
          return newMap;
        });
      } else {
        // Create new
        const newSub = await api.createRiskSubscription({
          risk_code: riskId,
          is_active: true,
          user_threshold: 50,
          notification_channels: { email: true, push: true },
          entity_filters: {}
        });
        setSubscriptions(prev => {
          const newMap = new Map(prev);
          newMap.set(riskId, newSub);
          return newMap;
        });
      }
    } catch (err) {
      console.error('Error toggling risk:', err);
    } finally {
      setSaving(prev => ({ ...prev, [riskId]: false }));
    }
  };

  const filteredRisks = RISK_CATALOG.filter(risk => {
    const matchesCategory = selectedCategory === 'All' || risk.category === selectedCategory;
    const matchesSearch = risk.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         risk.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories: { id: RiskCategory | 'All'; label: string }[] = [
    { id: 'All', label: 'Todos' },
    { id: 'Climate', label: 'Clima' },
    { id: 'WaterSoil', label: 'Suelo/Agua' },
    { id: 'Fungi', label: 'Hongos' },
    { id: 'Pests', label: 'Plagas' },
  ];

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        <span className="text-gray-500 font-medium">Cargando modelos de inteligencia...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hybrid Source Indicator */}
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <ShieldCheck className="h-6 w-6 text-green-700" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-green-900">Sistema de Inteligencia Híbrido</h3>
            <p className="text-xs text-green-700">Priorizando sensores locales con respaldo en modelos climáticos regionales.</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5 text-blue-700">
            <Zap className="h-3.5 w-3.5" /> Sensor IoT
          </div>
          <div className="flex items-center gap-1.5 text-orange-700">
            <CloudSun className="h-3.5 w-3.5" /> Virtual / Meteo
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex p-1 bg-gray-50 rounded-xl w-full md:w-auto">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === cat.id 
                  ? 'bg-white text-green-700 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-64 px-2">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filtrar modelos..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of Risks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRisks.map(risk => {
          const Icon = risk.icon;
          const sub = subscriptions.get(risk.id);
          const isActive = sub?.is_active ?? false;
          const isSaving = saving[risk.id] ?? false;
          const dataQuality = risk.params.every(p => availableSensors[p] === 'iot') ? 'high' : 'medium';

          return (
            <div 
              key={risk.id}
              className={`group relative bg-white rounded-2xl border-2 transition-all duration-300 ${
                isActive 
                  ? 'border-green-500 shadow-md' 
                  : 'border-gray-100 hover:border-green-200'
              }`}
            >
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`p-2.5 rounded-xl ${isActive ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <button
                    onClick={() => handleToggleRisk(risk.id)}
                    disabled={isSaving}
                    className="transition-opacity disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                    ) : isActive ? (
                      <ToggleRight className="h-9 w-9 text-green-600 cursor-pointer" />
                    ) : (
                      <ToggleLeft className="h-9 w-9 text-gray-300 cursor-pointer hover:text-gray-400" />
                    )}
                  </button>
                </div>

                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    {risk.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {risk.description}
                  </p>
                </div>

                {/* Requirements */}
                <div className="pt-3 border-t border-gray-50 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {risk.params.map(param => (
                      <span 
                        key={param}
                        className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                          availableSensors[param] === 'iot' 
                            ? 'bg-blue-50 text-blue-700' 
                            : 'bg-orange-50 text-orange-700'
                        }`}
                        title={availableSensors[param] === 'iot' ? 'Sensor real detectado' : 'Usando estimación meteorológica'}
                      >
                        {availableSensors[param] === 'iot' ? <Zap className="h-2.5 w-2.5" /> : <CloudSun className="h-2.5 w-2.5" />}
                        {param}
                      </span>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className={`px-2 py-0.5 rounded-full ${dataQuality === 'high' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {dataQuality === 'high' ? 'ALTA PRECISIÓN' : 'ESTIMADO'}
                    </span>
                    <span className="text-gray-400 uppercase tracking-tighter">
                      {risk.id}
                    </span>
                  </div>
                </div>

                {/* Active Settings */}
                {isActive && (
                  <div className="bg-green-50/50 rounded-xl p-3 flex items-center justify-between border border-green-100 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-green-800 uppercase">
                      <BellRing className="h-3.5 w-3.5" />
                      Monitorización ON
                    </div>
                    <Settings2 className="h-3.5 w-3.5 text-green-600 cursor-pointer hover:rotate-90 transition-transform" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredRisks.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <HelpCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900">No se encontraron modelos</h3>
        </div>
      )}
    </div>
  );
};
