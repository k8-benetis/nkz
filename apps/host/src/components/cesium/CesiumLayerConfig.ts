// =============================================================================
// Cesium Layer Configuration
// =============================================================================
// Configuration system for extensible Cesium layers

export type LayerType = 
  | 'osm'           // OpenStreetMap base
  | 'catastro'      // Cadastral parcels
  | 'ndvi'          // NDVI visualization
  | 'ign-3d'        // IGN 3D terrain
  | 'pnoa'          // PNOA orthophoto
  | 'cnig'          // CNIG relief
  | 'robots'        // Agricultural robots
  | 'sensors'       // IoT sensors
  | 'entities';     // Other NGSI-LD entities

export interface LayerConfig {
  id: LayerType;
  name: string;
  description: string;
  category: 'base' | 'data' | 'terrain' | 'entities';
  enabled: boolean;
  order: number; // Display order (lower = first)
  requiresAuth?: boolean; // Whether this layer requires authentication
  requiresData?: boolean; // Whether this layer requires data to be loaded
  hidden?: boolean;
}

export const DEFAULT_LAYER_CONFIGS: LayerConfig[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    description: 'Mapa base',
    category: 'base',
    enabled: true,
    order: 1,
  },
  {
    id: 'pnoa',
    name: 'PNOA',
    description: 'Ortofotografía PNOA',
    category: 'base',
    enabled: false,
    order: 2,
  },
  {
    id: 'cnig',
    name: 'CNIG',
    description: 'Relieve CNIG',
    category: 'terrain',
    enabled: false,
    order: 3,
  },
  {
    id: 'ign-3d',
    name: 'IGN 3D',
    description: 'Terreno 3D del IGN',
    category: 'terrain',
    enabled: false,
    order: 4,
  },
  {
    id: 'catastro',
    name: 'Parcelas Catastrales',
    description: 'Límites de parcelas',
    category: 'data',
    enabled: true,
    order: 10,
    requiresData: true,
  },
  {
    id: 'ndvi',
    name: 'NDVI',
    description: 'Índice de vegetación',
    category: 'data',
    enabled: false,
    order: 11,
    requiresData: true,
    hidden: true,
  },
  {
    id: 'robots',
    name: 'Robots',
    description: 'Robots agrícolas',
    category: 'entities',
    enabled: false,
    order: 20,
    requiresData: true,
  },
  {
    id: 'sensors',
    name: 'Sensores',
    description: 'Sensores IoT',
    category: 'entities',
    enabled: false,
    order: 21,
    requiresData: true,
  },
  {
    id: 'entities',
    name: 'Otras Entidades',
    description: 'Otras entidades NGSI-LD',
    category: 'entities',
    enabled: false,
    order: 22,
    requiresData: true,
  },
];

export interface LayerRenderer {
  type: LayerType;
  render: (viewer: any, Cesium: any, data: any, config: LayerConfig) => void;
  cleanup?: (viewer: any, entities: Map<string, any>) => void;
}

export interface EntityData {
  robots?: any[];
  sensors?: any[];
  parcels?: any[];
  ndviData?: Map<string, any[]>;
  entities?: any[];
}

