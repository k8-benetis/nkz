// =============================================================================
// TypeScript Types for Nekazari Platform
// =============================================================================

// User types are now handled by KeycloakAuthContext
// These legacy types are kept for backward compatibility

export interface ApiError {
  error: string;
  details?: string;
}

export interface RobotCapabilityTopic {
  name: string;
  topic: string;
  type: string;
}

export interface RobotCapabilityCamera {
  name: string;
  streamUrl: string;
}

export interface RobotCapabilityService {
  name: string;
  service: string;
  type: string;
}

export interface RobotCapabilityAction {
  name: string;
  action: string;
  type: string;
}

export interface RobotCapabilityTeleoperation {
  topic: string;
  type: string;
}

export interface RobotCapabilities {
  topics?: RobotCapabilityTopic[];
  cameras?: RobotCapabilityCamera[];
  services?: RobotCapabilityService[];
  actions?: RobotCapabilityAction[];
  teleoperation?: RobotCapabilityTeleoperation;
}

export interface Robot {
  id: string;
  type: string;
  name: {
    type: 'Property';
    value: string;
  };
  status: {
    type: 'Property';
    value: 'idle' | 'working' | 'charging' | 'error' | 'maintenance' | 'online' | 'offline' | 'connected';
  };
  batteryLevel?: {
    type: 'Property';
    value: number;
  };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  capabilities?: {
    type: 'Property' | 'StructuredValue';
    value: RobotCapabilities | string[];
  };
  lastHeartbeat?: {
    type: 'Property';
    value: string;
    observedAt?: string;
  };
}

export interface Sensor {
  id: string;
  type: string;
  name: {
    type: 'Property';
    value: string;
  };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  moisture?: {
    type: 'Property';
    value: number;
  };
  ph?: {
    type: 'Property';
    value: number;
  };
  temperature?: {
    type: 'Property';
    value: number;
  };
  external_id?: string;
  profile?: {
    code: string;
    name: string;
  };
  icon2d?: string; // URL to 2D icon
  model3d?: string; // URL to 3D model (GLTF/GLB)
  modelScale?: { type: 'Property'; value: number };
  modelRotation?: { type: 'Property'; value: [number, number, number] };
  /** NGSI-LD / Smart Data Models namespaced attributes (e.g. https://smartdatamodels.org/name) */
  [key: string]: unknown;
}

export interface AgriculturalMachine {
  id: string;
  type: string;
  name: {
    type: 'Property';
    value: string;
  };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  status?: {
    type: 'Property';
    value: 'idle' | 'working' | 'maintenance' | 'error';
  };
  operationType?: {
    type: 'Property';
    value: 'seeding' | 'fertilization' | 'spraying' | 'harvesting' | 'tillage' | 'irrigation';
  };
  external_id?: string;
  icon2d?: string;
  model3d?: string;
}

export interface LivestockAnimal {
  id: string;
  type: string;
  name: {
    type: 'Property';
    value: string;
  };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  activity?: {
    type: 'Property';
    value: 'grazing' | 'resting' | 'moving' | 'feeding';
  };
  species?: {
    type: 'Property';
    value: string;
  };
  external_id?: string;
  icon2d?: string;
  model3d?: string;
}

export interface WeatherStation {
  id: string;
  type: string;
  name: {
    type: 'Property';
    value: string;
  };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  temperature?: {
    type: 'Property';
    value: number;
  };
  humidity?: {
    type: 'Property';
    value: number;
  };
  windSpeed?: {
    type: 'Property';
    value: number;
  };
  external_id?: string;
  icon2d?: string;
  model3d?: string;
}

export interface SimulationCapability {
  model_name: string;
  model_type: string;
  algorithm: string;
  description: string;
  required_attributes: string[];
  output_attributes: string[];
}

export interface SimulationResult {
  simulation_name: string;
  entity_id: string;
  entity_type: string;
  result_data: Record<string, unknown>;
  visual_state: Record<string, unknown>;
  timestamp: string;
}

export interface Parcel {
  id: string;
  type: string;
  name?: string; // Simplified: just string
  area?: number; // Simplified: just number
  cropType?: string; // Simplified: just string
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Polygon' | 'Point';
      coordinates: number[][] | [number, number];
    };
  };
  // Sprint 1-4: Hierarchical parcel properties
  category?: 'cadastral' | 'managementZone';
  refParent?: string; // ID of parent parcel (for managementZone)
  children?: string[]; // IDs of child parcels (for cadastral)
  refFarm?: string; // Reference to farm entity
  ndviEnabled?: boolean;
  notes?: string;
  // Zonification metadata
  generationMethod?: 'grid' | 'manual' | 'ai' | 'split'; // How the zone was created
  aiModel?: string; // AI model used (if generationMethod === 'ai')
  confidence?: number; // Confidence score (0-1) for AI-generated zones
  municipality?: string;
  province?: string;
  cadastralReference?: string;
  // Simplified geometry for internal use
  geometry?: {
    type: 'Polygon' | 'Point';
    coordinates: number[][] | number[][][] | [number, number];
  };
}

// =============================================================================
// Asset Digitization Types
// =============================================================================

export interface AssetType {
  id: string;
  name: string;
  icon: string; // Icon name from lucide-react
  geometryType: 'Point' | 'LineString' | 'Polygon';
  sdmType: string;
  model3d?: string; // URL to glTF/GLB model
  defaultScale?: number;
  category: 'trees' | 'rows' | 'parcels' | 'infrastructure';
  defaultAttributes?: Record<string, unknown>;
}

export interface AssetProperties {
  scale?: number;
  rotation?: number;
  model3d?: string;
  [key: string]: unknown;
}

export interface AssetCreationPayload {
  assetType: string;
  name?: string;
  parcelId?: string;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: number[] | number[][] | number[][][];
  };
  properties: AssetProperties;
}

export interface TenantLimits {
  planType?: string | null;
  maxUsers?: number | null;
  maxRobots?: number | null;
  maxSensors?: number | null;
  maxAreaHectares?: number | null;
}

export interface TenantUsageStats {
  robots: number;
  sensors: number;
  parcels: number;
  areaHectares: number;
}

export interface TenantUsageSummary {
  tenant: string;
  usage: TenantUsageStats;
  limits: TenantLimits;
  percentages: {
    robots?: number;
    sensors?: number;
    areaHectares?: number;
  };
  timestamp: string;
}

export interface GrafanaLink {
  tenant: string;
  email?: string | null;
  orgId?: number;
  role?: string;
  membershipGranted?: boolean;
  url: string;
  dashboard?: string | null;
}

export type SupportedLanguage = 'es' | 'en' | 'ca' | 'eu' | 'fr' | 'pt';

export interface Translations {
  [key: string]: string | Translations;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface NDVIJob {
  id: string;
  parcelId?: string | null;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  requestedBy?: string | null;
  requestedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  timeRange?: {
    from?: string | null;
    to?: string | null;
  };
  resolution?: number | null;
  satellite?: string | null;
  ndviMean?: number | null;
  previewUrl?: string | null;
  error?: string | null;
  parameters?: Record<string, any> | null;
  geometry?: GeoPolygon | null;
  areaHectares?: number | null;
  jobType?: 'parcel' | 'manual' | string;
  progressMessage?: string | null;
  estimatedSecondsRemaining?: number | null;
}

export interface NDVIResult {
  id: string;
  jobId?: string | null;
  parcelId?: string | null;
  date?: string | null;
  ndviMean?: number | null;
  ndviMin?: number | null;
  ndviMax?: number | null;
  ndviStddev?: number | null;
  cloudCover?: number | null;
  rasterUrl?: string | null;
  previewUrl?: string | null;
  createdAt?: string | null;
  geometry?: GeoPolygon | null;
  areaHectares?: number | null;
  indicesData?: {
    [key: string]: {
      mean?: number | null;
      min?: number | null;
      max?: number | null;
      stddev?: number | null;
      p10?: number | null;
      p90?: number | null;
      median?: number | null;
      histogram?: {
        bins: number[];
        counts: number[];
        percentages: number[];
        total_pixels: number;
      } | null;
    };
  } | null;
}

// =============================================================================
// Risk Management Types
// =============================================================================

export interface RiskCatalog {
  risk_code: string;
  risk_name: string;
  risk_description?: string;
  target_sdm_type: string;
  target_subtype?: string;
  data_sources: string[];
  risk_domain: 'agronomic' | 'robotic' | 'energy' | 'livestock' | 'other';
  evaluation_mode: 'batch' | 'realtime' | 'hybrid';
  severity_levels: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface RiskSubscription {
  id: string;
  tenant_id: string;
  risk_code: string;
  is_active: boolean;
  user_threshold: number; // 0-100
  notification_channels: {
    email: boolean;
    push: boolean;
  };
  entity_filters?: Record<string, any>;
}

export interface RiskState {
  id: string;
  tenant_id: string;
  entity_id: string;
  entity_type: string;
  risk_code: string;
  probability_score: number; // 0-100
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  evaluation_data: Record<string, any>;
  timestamp: string;
}

export interface RiskWebhook {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  min_severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  created_at: string;
}

export interface EntityInventory {
  type: string;
  count: number;
  entities: Array<{
    id: string;
    name: string;
  }>;
}

export interface AgriCrop {
  id: string;
  type: string;
  name?: { type: 'Property'; value: string };
  agroVocConcept?: { type: 'Property'; value: string };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Polygon' | 'Point';
      coordinates: number[][] | [number, number];
    };
  };
}

export interface AgriBuilding {
  id: string;
  type: string;
  name?: { type: 'Property'; value: string };
  category?: { type: 'Property'; value: string };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Polygon' | 'Point';
      coordinates: number[][] | [number, number];
    };
  };
}

export interface Device {
  id: string;
  type: string;
  name?: { type: 'Property'; value: string };
  category?: { type: 'Property'; value: string };
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
}

// =============================================================================
// Water Infrastructure Types
// =============================================================================

export interface WaterSource {
  id: string;
  type: string; // 'WaterSource', 'Well', 'IrrigationOutlet', 'Spring', 'Pond'
  name?: { type: 'Property'; value: string };
  waterSourceType?: {
    type: 'Property';
    value: 'well' | 'irrigationOutlet' | 'spring' | 'pond' | 'reservoir' | 'canal' | 'other';
  };
  status?: {
    type: 'Property';
    value: 'active' | 'inactive' | 'maintenance' | 'dry';
  };
  flowRate?: { type: 'Property'; value: number }; // liters/min
  depth?: { type: 'Property'; value: number }; // meters (for wells)
  capacity?: { type: 'Property'; value: number }; // cubic meters (for reservoirs/ponds)
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  refParcel?: { type: 'Relationship'; object: string }; // Linked parcel
  icon2d?: string;
  model3d?: string;
}

// =============================================================================
// Tree/Crop Individual Types
// =============================================================================

export interface AgriTree {
  id: string;
  type: string; // 'AgriTree', 'Olive', 'Vine', 'FruitTree', etc.
  name?: { type: 'Property'; value: string };
  species?: { type: 'Property'; value: string }; // e.g., 'Olea europaea', 'Vitis vinifera'
  variety?: { type: 'Property'; value: string }; // e.g., 'Picual', 'Tempranillo'
  plantingDate?: { type: 'Property'; value: string }; // ISO date
  status?: {
    type: 'Property';
    value: 'healthy' | 'stressed' | 'diseased' | 'dead' | 'dormant';
  };
  height?: { type: 'Property'; value: number }; // meters
  trunkDiameter?: { type: 'Property'; value: number }; // centimeters
  canopyDiameter?: { type: 'Property'; value: number }; // meters
  location?: {
    type: 'GeoProperty';
    value: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  refParcel?: { type: 'Relationship'; object: string }; // Linked parcel
  icon2d?: string;
  model3d?: string;
}

