// =============================================================================
// Unified Asset Types for Asset Manager Grid
// =============================================================================
// Provides a normalized view of all entity types for the asset management UI.

// =============================================================================
// Asset Categories
// =============================================================================

export type AssetCategory = 
  | 'parcels'      // Parcelas y zonas
  | 'sensors'      // Sensores IoT
  | 'fleet'        // Robots y maquinaria
  | 'infrastructure' // Edificios e infraestructura
  | 'vegetation'   // Árboles y cultivos
  | 'livestock'    // Ganadería
  | 'water'        // Recursos hídricos
  | 'weather';     // Estaciones meteorológicas

export type AssetStatus = 
  | 'active'
  | 'inactive'
  | 'maintenance'
  | 'error'
  | 'offline'
  | 'unknown';

// =============================================================================
// Unified Asset Interface
// =============================================================================

export interface UnifiedAsset {
  // Core identification
  id: string;
  type: string;              // Original NGSI-LD type
  name: string;
  category: AssetCategory;
  
  // Status and health
  status: AssetStatus;
  statusLabel?: string;      // Human-readable status
  lastSeen?: Date;
  healthScore?: number;      // 0-100
  
  // Location
  hasLocation: boolean;
  coordinates?: [number, number]; // [lon, lat]
  geometryType?: 'Point' | 'Polygon' | 'LineString';
  municipality?: string;
  
  // Hierarchy
  parentId?: string;
  parentName?: string;
  childCount?: number;
  
  // Metadata
  createdAt?: Date;
  updatedAt?: Date;
  description?: string;
  tags?: string[];
  
  // Visualization
  icon?: string;             // Icon key or URL
  model3d?: string;          // 3D model URL
  color?: string;            // Display color
  
  // Type-specific data (kept for detail views)
  rawEntity: any;
  
  // Telemetry summary (optional, for sensors/devices)
  telemetrySummary?: {
    lastValue?: number;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
  };
}

// =============================================================================
// Asset Type Metadata
// =============================================================================

export interface AssetTypeInfo {
  type: string;
  label: string;
  labelPlural: string;
  category: AssetCategory;
  icon: string;              // Lucide icon name
  color: string;             // Tailwind color class
  description: string;
  supportsLocation: boolean;
  supportsHierarchy: boolean;
  supportsTelemetry: boolean;
}

export const ASSET_TYPE_REGISTRY: Record<string, AssetTypeInfo> = {
  // Parcels
  AgriParcel: {
    type: 'AgriParcel',
    label: 'Parcela',
    labelPlural: 'Parcelas',
    category: 'parcels',
    icon: 'map-pin',
    color: 'green',
    description: 'Parcela agrícola',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  Vineyard: {
    type: 'Vineyard',
    label: 'Viñedo',
    labelPlural: 'Viñedos',
    category: 'parcels',
    icon: 'grape',
    color: 'purple',
    description: 'Viñedo',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  OliveGrove: {
    type: 'OliveGrove',
    label: 'Olivar',
    labelPlural: 'Olivares',
    category: 'parcels',
    icon: 'trees',
    color: 'green',
    description: 'Olivar',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  
  // Sensors
  AgriSensor: {
    type: 'AgriSensor',
    label: 'Sensor',
    labelPlural: 'Sensores',
    category: 'sensors',
    icon: 'gauge',
    color: 'teal',
    description: 'Sensor agrícola',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  Device: {
    type: 'Device',
    label: 'Dispositivo',
    labelPlural: 'Dispositivos',
    category: 'sensors',
    icon: 'cpu',
    color: 'cyan',
    description: 'Dispositivo IoT',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  
  // Fleet
  AgriculturalRobot: {
    type: 'AgriculturalRobot',
    label: 'Robot',
    labelPlural: 'Robots',
    category: 'fleet',
    icon: 'bot',
    color: 'indigo',
    description: 'Robot agrícola autónomo',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  AgriculturalTractor: {
    type: 'AgriculturalTractor',
    label: 'Tractor',
    labelPlural: 'Tractores',
    category: 'fleet',
    icon: 'tractor',
    color: 'amber',
    description: 'Tractor ISOBUS',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  AgriculturalImplement: {
    type: 'AgriculturalImplement',
    label: 'Apero',
    labelPlural: 'Aperos',
    category: 'fleet',
    icon: 'wrench',
    color: 'gray',
    description: 'Implemento/Apero',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: false,
  },
  
  // Infrastructure
  AgriBuilding: {
    type: 'AgriBuilding',
    label: 'Edificio',
    labelPlural: 'Edificios',
    category: 'infrastructure',
    icon: 'building-2',
    color: 'slate',
    description: 'Edificio agrícola',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: false,
  },
  IrrigationSystem: {
    type: 'IrrigationSystem',
    label: 'Sistema de Riego',
    labelPlural: 'Sistemas de Riego',
    category: 'infrastructure',
    icon: 'droplets',
    color: 'blue',
    description: 'Sistema de riego',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  
  // Vegetation
  AgriCrop: {
    type: 'AgriCrop',
    label: 'Cultivo',
    labelPlural: 'Cultivos',
    category: 'vegetation',
    icon: 'leaf',
    color: 'emerald',
    description: 'Cultivo agrícola',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  AgriTree: {
    type: 'AgriTree',
    label: 'Árbol',
    labelPlural: 'Árboles',
    category: 'vegetation',
    icon: 'tree-deciduous',
    color: 'green',
    description: 'Árbol individual',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  OliveTree: {
    type: 'OliveTree',
    label: 'Olivo',
    labelPlural: 'Olivos',
    category: 'vegetation',
    icon: 'tree-deciduous',
    color: 'green',
    description: 'Olivo individual',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  Vine: {
    type: 'Vine',
    label: 'Cepa',
    labelPlural: 'Cepas',
    category: 'vegetation',
    icon: 'grape',
    color: 'purple',
    description: 'Cepa de vid',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  FruitTree: {
    type: 'FruitTree',
    label: 'Frutal',
    labelPlural: 'Frutales',
    category: 'vegetation',
    icon: 'apple',
    color: 'orange',
    description: 'Árbol frutal',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  
  // Livestock
  LivestockAnimal: {
    type: 'LivestockAnimal',
    label: 'Animal',
    labelPlural: 'Animales',
    category: 'livestock',
    icon: 'beef',
    color: 'amber',
    description: 'Animal individual',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: true,
  },
  LivestockGroup: {
    type: 'LivestockGroup',
    label: 'Rebaño',
    labelPlural: 'Rebaños',
    category: 'livestock',
    icon: 'users',
    color: 'amber',
    description: 'Grupo de animales',
    supportsLocation: true,
    supportsHierarchy: true,
    supportsTelemetry: false,
  },
  
  // Water
  WaterSource: {
    type: 'WaterSource',
    label: 'Fuente de Agua',
    labelPlural: 'Fuentes de Agua',
    category: 'water',
    icon: 'droplet',
    color: 'blue',
    description: 'Fuente de agua',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  Well: {
    type: 'Well',
    label: 'Pozo',
    labelPlural: 'Pozos',
    category: 'water',
    icon: 'circle-dot',
    color: 'blue',
    description: 'Pozo',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
  Pond: {
    type: 'Pond',
    label: 'Estanque',
    labelPlural: 'Estanques',
    category: 'water',
    icon: 'waves',
    color: 'blue',
    description: 'Estanque/Balsa',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: false,
  },
  
  // Weather
  WeatherObserved: {
    type: 'WeatherObserved',
    label: 'Estación Meteo',
    labelPlural: 'Estaciones Meteo',
    category: 'weather',
    icon: 'cloud-sun',
    color: 'sky',
    description: 'Estación meteorológica',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: true,
  },
};

// =============================================================================
// Category Metadata
// =============================================================================

export interface CategoryInfo {
  id: AssetCategory;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const CATEGORY_REGISTRY: Record<AssetCategory, CategoryInfo> = {
  parcels: {
    id: 'parcels',
    label: 'Parcelas',
    icon: 'map',
    color: 'green',
    description: 'Terrenos y zonas de cultivo',
  },
  sensors: {
    id: 'sensors',
    label: 'Sensores',
    icon: 'gauge',
    color: 'teal',
    description: 'Sensores y dispositivos IoT',
  },
  fleet: {
    id: 'fleet',
    label: 'Flota',
    icon: 'truck',
    color: 'indigo',
    description: 'Robots, tractores y maquinaria',
  },
  infrastructure: {
    id: 'infrastructure',
    label: 'Infraestructura',
    icon: 'building',
    color: 'slate',
    description: 'Edificios y sistemas',
  },
  vegetation: {
    id: 'vegetation',
    label: 'Vegetación',
    icon: 'trees',
    color: 'emerald',
    description: 'Cultivos y árboles',
  },
  livestock: {
    id: 'livestock',
    label: 'Ganadería',
    icon: 'beef',
    color: 'amber',
    description: 'Animales y rebaños',
  },
  water: {
    id: 'water',
    label: 'Agua',
    icon: 'droplets',
    color: 'blue',
    description: 'Recursos hídricos',
  },
  weather: {
    id: 'weather',
    label: 'Meteorología',
    icon: 'cloud-sun',
    color: 'sky',
    description: 'Estaciones meteorológicas',
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract name from NGSI-LD entity
 */
function extractName(entity: any): string {
  if (!entity) return 'Sin nombre';
  if (typeof entity.name === 'string') return entity.name;
  if (entity.name?.value) return entity.name.value;
  // Fallback to ID
  const id = entity.id || '';
  const parts = id.split(':');
  return parts[parts.length - 1] || id;
}

/**
 * Extract coordinates from NGSI-LD location
 */
function extractCoordinates(entity: any): [number, number] | undefined {
  const location = entity.location?.value || entity.location;
  if (!location) return undefined;
  
  const coords = location.coordinates;
  if (!coords) return undefined;
  
  // Point: [lon, lat]
  if (location.type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
    return [coords[0], coords[1]];
  }
  
  // Polygon: Calculate centroid from first ring
  if (location.type === 'Polygon' && Array.isArray(coords) && coords.length > 0) {
    const ring = coords[0];
    if (Array.isArray(ring) && ring.length > 0) {
      let sumLon = 0, sumLat = 0;
      ring.forEach((point: any) => {
        if (Array.isArray(point) && point.length >= 2) {
          sumLon += point[0];
          sumLat += point[1];
        }
      });
      return [sumLon / ring.length, sumLat / ring.length];
    }
  }
  
  return undefined;
}

/**
 * Determine asset status from various entity properties
 */
function extractStatus(entity: any): AssetStatus {
  const status = entity.status?.value || entity.status;
  
  if (!status) return 'unknown';
  
  switch (status.toLowerCase()) {
    case 'active':
    case 'online':
    case 'connected':
    case 'working':
    case 'healthy':
      return 'active';
    case 'inactive':
    case 'offline':
    case 'disconnected':
    case 'idle':
      return 'inactive';
    case 'maintenance':
    case 'charging':
      return 'maintenance';
    case 'error':
    case 'failed':
    case 'critical':
      return 'error';
    default:
      return 'unknown';
  }
}

/**
 * Convert any NGSI-LD entity to UnifiedAsset
 */
export function normalizeToAsset(entity: any): UnifiedAsset {
  const typeInfo = ASSET_TYPE_REGISTRY[entity.type] || {
    type: entity.type,
    label: entity.type,
    category: 'sensors' as AssetCategory,
    icon: 'box',
    color: 'gray',
    description: 'Entidad desconocida',
    supportsLocation: true,
    supportsHierarchy: false,
    supportsTelemetry: false,
  };
  
  const coordinates = extractCoordinates(entity);
  const location = entity.location?.value || entity.location;
  
  return {
    id: entity.id,
    type: entity.type,
    name: extractName(entity),
    category: typeInfo.category,
    status: extractStatus(entity),
    statusLabel: entity.status?.value || entity.status || 'Desconocido',
    lastSeen: entity.lastHeartbeat?.value 
      ? new Date(entity.lastHeartbeat.value) 
      : entity.dateModified?.value 
        ? new Date(entity.dateModified.value) 
        : undefined,
    healthScore: entity.batteryLevel?.value || undefined,
    hasLocation: !!coordinates,
    coordinates,
    geometryType: location?.type as any,
    municipality: entity.municipality || entity.address?.municipality,
    parentId: entity.refParent?.object || entity.refParent,
    parentName: undefined, // Will be populated by hook if needed
    childCount: entity.children?.length || 0,
    createdAt: entity.dateCreated?.value ? new Date(entity.dateCreated.value) : undefined,
    updatedAt: entity.dateModified?.value ? new Date(entity.dateModified.value) : undefined,
    description: entity.description?.value || entity.description,
    tags: entity.tags?.value || entity.tags || [],
    icon: entity.icon?.value || entity.icon || typeInfo.icon,
    model3d: entity.ref3DModel?.value || entity.ref3DModel || entity.model3d,
    color: typeInfo.color,
    rawEntity: entity,
    telemetrySummary: typeInfo.supportsTelemetry ? {
      lastValue: entity.temperature?.value 
        || entity.moisture?.value 
        || entity.batteryLevel?.value 
        || undefined,
      unit: entity.temperature?.value ? '°C' 
        : entity.moisture?.value ? '%' 
        : entity.batteryLevel?.value ? '%' 
        : undefined,
      trend: 'stable',
    } : undefined,
  };
}

/**
 * Normalize multiple entities of different types
 */
export function normalizeEntities(entities: Record<string, any[]>): UnifiedAsset[] {
  const assets: UnifiedAsset[] = [];
  
  Object.entries(entities).forEach(([type, items]) => {
    if (Array.isArray(items)) {
      items.forEach(item => {
        try {
          assets.push(normalizeToAsset({ ...item, type: item.type || type }));
        } catch (e) {
          console.warn(`[Assets] Failed to normalize entity:`, item, e);
        }
      });
    }
  });
  
  return assets;
}

// =============================================================================
// Filter Types
// =============================================================================

export interface AssetFilters {
  search: string;
  categories: AssetCategory[];
  types: string[];
  statuses: AssetStatus[];
  hasLocation: boolean | null;
  municipality: string | null;
  parentId: string | null;
}

export const DEFAULT_FILTERS: AssetFilters = {
  search: '',
  categories: [],
  types: [],
  statuses: [],
  hasLocation: null,
  municipality: null,
  parentId: null,
};

/**
 * Apply filters to asset list
 */
export function filterAssets(assets: UnifiedAsset[], filters: AssetFilters): UnifiedAsset[] {
  return assets.filter(asset => {
    // Search filter (name, type, id)
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const matchesSearch = 
        asset.name.toLowerCase().includes(search) ||
        asset.type.toLowerCase().includes(search) ||
        asset.id.toLowerCase().includes(search) ||
        (asset.municipality?.toLowerCase().includes(search) ?? false);
      if (!matchesSearch) return false;
    }
    
    // Category filter
    if (filters.categories.length > 0 && !filters.categories.includes(asset.category)) {
      return false;
    }
    
    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(asset.type)) {
      return false;
    }
    
    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(asset.status)) {
      return false;
    }
    
    // Location filter
    if (filters.hasLocation !== null && asset.hasLocation !== filters.hasLocation) {
      return false;
    }
    
    // Municipality filter
    if (filters.municipality && asset.municipality !== filters.municipality) {
      return false;
    }
    
    // Parent filter
    if (filters.parentId && asset.parentId !== filters.parentId) {
      return false;
    }
    
    return true;
  });
}

// =============================================================================
// Sort Types
// =============================================================================

export type SortField = 'name' | 'type' | 'status' | 'lastSeen' | 'municipality';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export function sortAssets(assets: UnifiedAsset[], sort: SortConfig): UnifiedAsset[] {
  return [...assets].sort((a, b) => {
    let comparison = 0;
    
    switch (sort.field) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'lastSeen': {
        const aTime = a.lastSeen?.getTime() || 0;
        const bTime = b.lastSeen?.getTime() || 0;
        comparison = aTime - bTime;
        break;
      }
      case 'municipality':
        comparison = (a.municipality || '').localeCompare(b.municipality || '');
        break;
    }
    
    return sort.direction === 'desc' ? -comparison : comparison;
  });
}

