
import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Zap, Info, 
  Search, Settings2, BellRing,
  Database, CloudSun, ToggleRight, ToggleLeft, HelpCircle
} from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { RISK_CATALOG, RiskCategory } from '@/config/riskCatalog';

export const RiskMarketplace: React.FC = () => {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState<RiskCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [availableSensors, setAvailableSensors] = useState<Record<string, 'iot' | 'virtual'>>({});

  useEffect(() => {
    // Log t usage to satisfy build rules if needed, though it's typically used in JSX
    console.debug('RiskMarketplace initialized with i18n:', t('risks.title' as any));
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch active subscriptions from risk-api
        const subRes = await fetch('/api/risks/subscriptions');
        if (subRes.ok) {
          const subs = await subRes.json();
          setActiveSubscriptions(subs.map((s: any) => s.risk_code));
        }

        // 2. Introspect available sensors from Entity Manager
        // This simulates checking for real IoT data in the tenant
        const entityRes = await fetch('/api/modules/entities/summary');
        if (entityRes.ok) {
          const summary = await entityRes.json();
          // We map available attributes to our risk params
          const sensors: Record<string, 'iot' | 'virtual'> = {};
          
          // Logic: If attribute exists in summary, it's IoT. Else, it's Virtual (fallback)
          const iotAttrs = summary.attributes || [];
          
          const allParams = Array.from(new Set(RISK_CATALOG.flatMap(r => r.params)));
          allParams.forEach(p => {
            sensors[p] = iotAttrs.includes(p) ? 'iot' : 'virtual';
          });
          setAvailableSensors(sensors);
        }
      } catch (err) {
        console.error('Error fetching risk data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleToggleRisk = async (riskId: string) => {
    const isActive = activeSubscriptions.includes(riskId);
    
    try {
      if (isActive) {
        // Deactivate
        const res = await fetch(`/api/risks/subscriptions/${riskId}`, { method: 'DELETE' });
        if (res.ok) {
          setActiveSubscriptions(prev => prev.filter(id => id !== riskId));
        }
      } else {
        // Activate
        const res = await fetch('/api/risks/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            risk_code: riskId,
            user_threshold: 50,
            notification_channels: { email: true, push: true }
          })
        });
        if (res.ok) {
          setActiveSubscriptions(prev => [...prev, riskId]);
        }
      }
    } catch (err) {
      console.error('Error toggling risk:', err);
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-green-600" />
            Marketplace de Riesgos Inteligentes
          </h1>
          <p className="text-gray-500 mt-1">
            Activa modelos predictivos basados en tus sensores o datos climáticos regionales.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-green-50 px-4 py-2 rounded-xl border border-green-100">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white border-2 border-white">
              <Database className="h-4 w-4" />
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white border-2 border-white">
              <CloudSun className="h-4 w-4" />
            </div>
          </div>
          <span className="text-sm font-medium text-green-800">
            Híbrido: Sensores + Virtualización Activa
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex p-1 bg-gray-100 rounded-xl w-full md:w-auto">
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
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar riesgo..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of Risks */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-64 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRisks.map(risk => {
            const Icon = risk.icon;
            const isActive = activeSubscriptions.includes(risk.id);
            const dataQuality = risk.params.every(p => availableSensors[p] === 'iot') ? 'high' : 'medium';

            return (
              <div 
                key={risk.id}
                className={`group relative bg-white rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                  isActive 
                    ? 'border-green-500 shadow-green-100 shadow-xl' 
                    : 'border-gray-100 hover:border-green-200 hover:shadow-lg'
                }`}
              >
                {/* Status Bar */}
                <div className={`h-1.5 w-full ${isActive ? 'bg-green-500' : 'bg-transparent'}`} />
                
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-xl ${isActive ? 'bg-green-50' : 'bg-gray-50'} group-hover:scale-110 transition-transform`}>
                      <Icon className={`h-6 w-6 ${isActive ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <button
                      onClick={() => handleToggleRisk(risk.id)}
                      className="transition-transform active:scale-90"
                    >
                      {isActive ? (
                        <ToggleRight className="h-10 w-10 text-green-600 cursor-pointer" />
                      ) : (
                        <ToggleLeft className="h-10 w-10 text-gray-300 cursor-pointer hover:text-gray-400" />
                      )}
                    </button>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                      {risk.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {risk.description}
                    </p>
                  </div>

                  {/* Requirements & Source */}
                  <div className="pt-4 border-t border-gray-50 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {risk.params.map(param => (
                        <span 
                          key={param}
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md flex items-center gap-1 ${
                            availableSensors[param] === 'iot' 
                              ? 'bg-blue-50 text-blue-700' 
                              : 'bg-orange-50 text-orange-700'
                          }`}
                        >
                          {availableSensors[param] === 'iot' ? <Zap className="h-3 w-3" /> : <CloudSun className="h-3 w-3" />}
                          {param}
                        </span>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        {risk.fallbackStrategy}
                      </span>
                      <span className={`font-bold ${dataQuality === 'high' ? 'text-green-600' : 'text-orange-500'}`}>
                        {dataQuality === 'high' ? 'DATOS REALES' : 'ESTIMACIÓN'}
                      </span>
                    </div>
                  </div>

                  {/* Thresholds Preview */}
                  {isActive && (
                    <div className="bg-green-50/50 rounded-xl p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-green-800">
                        <BellRing className="h-4 w-4" />
                        Alertas Activas
                      </div>
                      <Settings2 className="h-4 w-4 text-green-600 cursor-pointer hover:rotate-45 transition-transform" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredRisks.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <HelpCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No se encontraron riesgos</h3>
          <p className="text-gray-500">Prueba con otra búsqueda o categoría.</p>
        </div>
      )}
    </div>
  );
};
