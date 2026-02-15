// =============================================================================
// Entities Page - Visualización de todas las entidades
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { CesiumMap } from '@/components/CesiumMap';
import { EntityList, EntityListItem } from '@/components/EntityList';
import { EntityWizard } from '@/components/EntityWizard';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import { parcelApi } from '@/services/parcelApi';
import {
  MapPin,
  Bot,
  Gauge,
  RefreshCw,
  Search,
  Plus
} from 'lucide-react';
import type { Robot, Sensor, AgriculturalMachine, LivestockAnimal, WeatherStation, Parcel } from '@/types';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SensorInspector } from '@/components/SensorInspector';

export const Entities: React.FC = () => {
  const { t } = useI18n();
  const { hasAnyRole } = useAuth();
  const navigate = useNavigate();

  // Tabs: 'crops', 'fleet', 'installations'
  const [activeTab, setActiveTab] = useState<'crops' | 'fleet' | 'installations'>('crops');

  // State for all entity types
  const [robots, setRobots] = useState<Robot[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [machines, setMachines] = useState<AgriculturalMachine[]>([]);
  const [livestock, setLivestock] = useState<LivestockAnimal[]>([]);
  const [weatherStations, setWeatherStations] = useState<WeatherStation[]>([]);
  const [crops, setCrops] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<EntityListItem | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const canManageDevices = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant', 'Farmer']);

  useEffect(() => {
    console.log('[Entities] Page Mounted');
    loadAllEntities();
    return () => console.log('[Entities] Page Unmounted');
  }, []);

  const loadAllEntities = async () => {
    setIsLoading(true);
    try {
      const [
        robotsData,
        sensorsData,
        machinesData,
        livestockData,
        weatherData,
        parcelsData,
        cropsData,
        buildingsData,
        devicesData
      ] = await Promise.allSettled([
        api.getRobots().catch(() => []),
        api.getSensors().catch(() => []),
        api.getMachines().catch(() => []),
        api.getLivestock().catch(() => []),
        api.getWeatherStations().catch(() => []),
        parcelApi.getParcels().catch(() => []),
        api.getSDMEntityInstances('AgriCrop').catch(() => []),
        api.getSDMEntityInstances('AgriBuilding').catch(() => []),
        api.getSDMEntityInstances('Device').catch(() => [])
      ]);

      setRobots(robotsData.status === 'fulfilled' ? robotsData.value : []);
      setSensors(sensorsData.status === 'fulfilled' ? sensorsData.value : []);
      setMachines(machinesData.status === 'fulfilled' ? machinesData.value : []);
      setLivestock(livestockData.status === 'fulfilled' ? livestockData.value : []);
      setWeatherStations(weatherData.status === 'fulfilled' ? weatherData.value : []);
      setParcels(parcelsData.status === 'fulfilled' ? parcelsData.value : []);
      setCrops(cropsData.status === 'fulfilled' ? cropsData.value : []);
      setBuildings(buildingsData.status === 'fulfilled' ? buildingsData.value : []);
      setDevices(devicesData.status === 'fulfilled' ? devicesData.value : []);

    } catch (error) {
      console.error('Error loading entities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to extract value from NGSI-LD property (Normalized or Simplified)
  const extractValue = (prop: any): any => {
    if (prop === null || prop === undefined) return undefined;
    if (prop && typeof prop === 'object' && 'value' in prop) return prop.value;
    return prop;
  };

  const getFilteredEntities = (): EntityListItem[] => {
    let entities: EntityListItem[] = [];

    if (activeTab === 'crops') {
      // Add Parcels
      parcels.forEach(p => {
        try {
          if (!p) return;
          const name = extractValue(p.name) || p.cadastralReference || p.id || 'Parcela sin nombre';
          const area = extractValue(p.area);
          const cropType = extractValue(p.cropType);

          entities.push({
            id: p.id || `unknown-${Math.random()}`,
            type: 'AgriParcel',
            name: name,
            details: `${area ? area + ' ha' : ''} ${cropType ? ' - ' + cropType : ''}`,
            data: p
          });
        } catch (e) {
          console.error('Error processing parcel:', p, e);
        }
      });
      // Add Crops
      crops.forEach(c => {
        try {
          if (!c) return;
          const name = extractValue(c.name) || c.id || 'Cultivo sin nombre';
          const details = extractValue(c.agroVocConcept);

          entities.push({
            id: c.id || `unknown-${Math.random()}`,
            type: 'AgriCrop',
            name: name,
            details: details,
            data: c
          });
        } catch (e) {
          console.error('Error processing crop:', c, e);
        }
      });
    } else if (activeTab === 'fleet') {
      // Add Robots
      robots.forEach(r => {
        try {
          if (!r) return;
          const name = extractValue(r.name) || r.id || 'Robot sin nombre';
          const status = extractValue(r.status);
          const battery = extractValue(r.batteryLevel);

          entities.push({
            id: r.id || `unknown-${Math.random()}`,
            type: 'AgriculturalRobot',
            name: name,
            status: status,
            details: `${battery ? 'Bat: ' + battery + '%' : ''}`,
            data: r
          });
        } catch (e) {
          console.error('Error processing robot:', r, e);
        }
      });
      // Add Machines
      machines.forEach(m => {
        try {
          if (!m) return;
          const name = extractValue(m.name) || m.id || 'Máquina sin nombre';
          const status = extractValue(m.status);

          entities.push({
            id: m.id || `unknown-${Math.random()}`,
            type: 'Tractor',
            name: name,
            status: status,
            data: m
          });
        } catch (e) {
          console.error('Error processing machine:', m, e);
        }
      });
    } else if (activeTab === 'installations') {
      // Add Sensors
      sensors.forEach(s => {
        try {
          if (!s) return;
          const name = extractValue(s.name) || s.id || 'Sensor sin nombre';
          const profile = s.profile?.name || extractValue((s as any).refDevice); // Fallback to refDevice if profile missing

          entities.push({
            id: s.id || `unknown-${Math.random()}`,
            type: 'AgriSensor',
            name: name,
            details: profile,
            data: s
          });
        } catch (e) {
          console.error('Error processing sensor:', s, e);
        }
      });
      // Add Weather Stations
      weatherStations.forEach(w => {
        try {
          if (!w) return;
          const name = extractValue(w.name) || w.id || 'Estación sin nombre';

          entities.push({
            id: w.id || `unknown-${Math.random()}`,
            type: 'WeatherObserved',
            name: name,
            data: w
          });
        } catch (e) {
          console.error('Error processing weather station:', w, e);
        }
      });
      // Add Buildings
      buildings.forEach(b => {
        try {
          if (!b) return;
          const name = extractValue(b.name) || b.id || 'Edificio sin nombre';
          const category = extractValue(b.category);

          entities.push({
            id: b.id || `unknown-${Math.random()}`,
            type: 'AgriBuilding',
            name: name,
            details: category,
            data: b
          });
        } catch (e) {
          console.error('Error processing building:', b, e);
        }
      });
      // Add Devices
      devices.forEach(d => {
        try {
          if (!d) return;
          const name = extractValue(d.name) || d.id || 'Dispositivo sin nombre';
          const category = extractValue(d.category);

          entities.push({
            id: d.id || `unknown-${Math.random()}`,
            type: 'Device',
            name: name,
            details: category,
            data: d
          });
        } catch (e) {
          console.error('Error processing device:', d, e);
        }
      });
      // Add Livestock
      livestock.forEach(l => {
        try {
          if (!l) return;
          const name = extractValue(l.name) || l.id || 'Animal sin nombre';
          const species = extractValue(l.species);

          entities.push({
            id: l.id || `unknown-${Math.random()}`,
            type: 'LivestockAnimal',
            name: name,
            details: species,
            data: l
          });
        } catch (e) {
          console.error('Error processing livestock:', l, e);
        }
      });
    }

    if (searchTerm) {
      entities = entities.filter(e =>
        (e.name && e.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (e.type && e.type.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    return entities;
  };

  const filteredEntities = getFilteredEntities();

  const handleEntityClick = (entity: EntityListItem) => {
    setSelectedEntity(entity);
    // Navigation removed to allow zooming in map
  };

  const entityCounts = {
    crops: parcels.length + crops.length,
    fleet: robots.length + machines.length,
    installations: sensors.length + weatherStations.length + buildings.length + devices.length + livestock.length
  };

  return (
    <ErrorBoundary>
      <Layout>
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <MapPin className="w-8 h-8 text-blue-600" />
                Gestión de Entidades
              </h1>
              <p className="text-gray-600 mt-1">
                Visualización centralizada de todos los activos
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadAllEntities}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
              {canManageDevices && (
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Entidad
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 flex-shrink-0 bg-white rounded-t-lg px-2">
            <button
              onClick={() => setActiveTab('crops')}
              className={`px-6 py-4 font-medium text-sm transition-all border-b-2 ${activeTab === 'crops'
                ? 'border-green-500 text-green-600 bg-green-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Cultivos <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{entityCounts.crops}</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('fleet')}
              className={`px-6 py-4 font-medium text-sm transition-all border-b-2 ${activeTab === 'fleet'
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Flota <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{entityCounts.fleet}</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('installations')}
              className={`px-6 py-4 font-medium text-sm transition-all border-b-2 ${activeTab === 'installations'
                ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Instalaciones <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{entityCounts.installations}</span>
              </div>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
            {/* List Panel */}
            <div className="lg:col-span-1 bg-white rounded-lg shadow flex flex-col min-h-0 border border-gray-200">
              <div className="p-4 border-b flex-shrink-0 bg-gray-50 rounded-t-lg">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Buscar entidades..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                <EntityList
                  entities={filteredEntities}
                  onEntityClick={handleEntityClick}
                  selectedId={selectedEntity?.id}
                  isLoading={isLoading}
                />
              </div>
            </div>

            {/* Map Panel */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden flex flex-col min-h-0 border border-gray-200">
              <div className="flex-1 relative">
                <ErrorBoundary componentName="Mapa de Entidades">
                  <CesiumMap
                    title={activeTab === 'crops' ? 'Mapa de Cultivos' : activeTab === 'fleet' ? 'Flota en Tiempo Real' : 'Infraestructura'}
                    parcels={activeTab === 'crops' ? parcels : []}
                    robots={activeTab === 'fleet' ? robots : []}
                    machines={activeTab === 'fleet' ? machines : []}
                    sensors={sensors}
                    livestock={activeTab === 'installations' ? livestock : []}
                    weatherStations={activeTab === 'installations' ? weatherStations : []}

                    crops={activeTab === 'crops' ? crops : []}
                    buildings={activeTab === 'installations' ? buildings : []}
                    devices={activeTab === 'installations' ? devices : []}
                    enable3DTerrain={true}
                    terrainProvider="auto"
                    showControls={true}
                    height="h-full"
                    // @ts-ignore - Prop will be added to CesiumMap
                    selectedEntity={selectedEntity}
                  />
                </ErrorBoundary>

                {/* Sensor Inspector Drawer - Overlay on map */}
                <SensorInspector
                  entity={selectedEntity}
                  isOpen={selectedEntity !== null}
                  onClose={() => setSelectedEntity(null)}
                />
              </div>
            </div>
          </div>
        </div>


        <EntityWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onSuccess={() => {
            loadAllEntities();
            setIsWizardOpen(false);
          }}
        />
      </Layout >
    </ErrorBoundary>
  );
};


