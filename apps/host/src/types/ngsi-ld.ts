// =============================================================================
// NGSI-LD TypeScript Types - SDK 2.0
// =============================================================================
// Complete TypeScript definitions for FIWARE NGSI-LD standard entities,
// properties, relationships, and operations.

// =============================================================================
// Core NGSI-LD Types
// =============================================================================

/**
 * NGSI-LD Property - Represents a property value with metadata
 */
export interface NGSIProperty {
  type: 'Property';
  value: string | number | boolean | object | null;
  observedAt?: string; // ISO 8601 timestamp
  unitCode?: string;
  datasetId?: string;
  createdAt?: string; // ISO 8601 timestamp
  modifiedAt?: string; // ISO 8601 timestamp
  [key: string]: any; // Allow additional metadata
}

/**
 * NGSI-LD Relationship - Represents a relationship to another entity
 */
export interface NGSIRelationship {
  type: 'Relationship';
  object: string; // Entity ID (URI)
  observedAt?: string;
  datasetId?: string;
  createdAt?: string;
  modifiedAt?: string;
  [key: string]: any;
}

/**
 * NGSI-LD GeoProperty - Represents a geographic location
 */
export interface NGSIGeoProperty {
  type: 'GeoProperty';
  value: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][];
  };
  observedAt?: string;
  datasetId?: string;
  createdAt?: string;
  modifiedAt?: string;
  [key: string]: any;
}

/**
 * NGSI-LD Language Property - Multi-language text value
 */
export interface NGSILanguageProperty {
  type: 'LanguageProperty';
  languageMap: Record<string, string>; // { "es": "valor", "en": "value" }
  observedAt?: string;
  datasetId?: string;
  createdAt?: string;
  modifiedAt?: string;
  [key: string]: any;
}

/**
 * Union type for all NGSI-LD attribute types
 */
export type NGSAttribute = NGSIProperty | NGSIRelationship | NGSIGeoProperty | NGSILanguageProperty;

/**
 * Base NGSI-LD Entity structure
 */
export interface NGSIEntity {
  id: string; // URI (e.g., "urn:ngsi-ld:AgriSensor:sensor1")
  type: string; // Entity type (e.g., "AgriSensor")
  '@context'?: string | string[] | object; // JSON-LD context
  [attributeName: string]: NGSAttribute | string | string[] | object | undefined;
}

// =============================================================================
// Common NGSI-LD Attribute Names
// =============================================================================

/**
 * Common property names used across NGSI-LD entities
 */
export const COMMON_PROPERTIES = {
  // Identification
  NAME: 'name',
  DESCRIPTION: 'description',
  
  // Location
  LOCATION: 'location',
  ADDRESS: 'address',
  
  // Time
  DATE_CREATED: 'dateCreated',
  DATE_MODIFIED: 'dateModified',
  DATE_OBSERVED: 'dateObserved',
  
  // Status
  STATUS: 'status',
  STATE: 'state',
  
  // Relationships
  REF_PARCEL: 'refAgriParcel',
  REF_FARM: 'refAgriFarm',
  REF_GREENHOUSE: 'refAgriGreenhouse',
  REF_SENSOR: 'refSensor',
  REF_ROBOT: 'refRobot',
  
  // Measurements (for sensors)
  TEMPERATURE: 'airTemperature',
  HUMIDITY: 'relativeHumidity',
  SOIL_MOISTURE: 'soilMoisture',
  BATTERY_LEVEL: 'batteryLevel',
  PRESSURE: 'atmosphericPressure',
  WIND_SPEED: 'windSpeed',
  SOLAR_RADIATION: 'solarRadiation',
} as const;

// =============================================================================
// Entity Type Definitions
// =============================================================================

/**
 * AgriSensor entity structure
 */
export interface AgriSensor extends NGSIEntity {
  type: 'AgriSensor';
  name?: NGSIProperty;
  description?: NGSIProperty;
  location?: NGSIGeoProperty;
  refAgriParcel?: NGSIRelationship;
  batteryLevel?: NGSIProperty;
  airTemperature?: NGSIProperty;
  relativeHumidity?: NGSIProperty;
  soilMoisture?: NGSIProperty;
  atmosphericPressure?: NGSIProperty;
  windSpeed?: NGSIProperty;
  solarRadiation?: NGSIProperty;
  dateObserved?: NGSIProperty;
  [key: string]: any;
}

/**
 * AgriculturalRobot entity structure
 */
export interface AgriculturalRobot extends NGSIEntity {
  type: 'AgriculturalRobot';
  name?: NGSIProperty;
  description?: NGSIProperty;
  location?: NGSIGeoProperty;
  refAgriParcel?: NGSIRelationship;
  refAgriFarm?: NGSIRelationship;
  batteryLevel?: NGSIProperty;
  status?: NGSIProperty;
  operationMode?: NGSIProperty;
  [key: string]: any;
}

/**
 * AgriParcel entity structure
 */
export interface AgriParcel extends NGSIEntity {
  type: 'AgriParcel';
  name?: NGSIProperty;
  description?: NGSIProperty;
  location?: NGSIGeoProperty;
  address?: NGSIProperty;
  refAgriFarm?: NGSIRelationship;
  area?: NGSIProperty;
  category?: NGSIProperty;
  cropStatus?: NGSIProperty;
  [key: string]: any;
}

/**
 * AgriFarm entity structure
 */
export interface AgriFarm extends NGSIEntity {
  type: 'AgriFarm';
  name?: NGSIProperty;
  description?: NGSIProperty;
  location?: NGSIGeoProperty;
  address?: NGSIProperty;
  contactPoint?: NGSIProperty;
  [key: string]: any;
}

/**
 * AgriGreenhouse entity structure
 */
export interface AgriGreenhouse extends NGSIEntity {
  type: 'AgriGreenhouse';
  name?: NGSIProperty;
  description?: NGSIProperty;
  location?: NGSIGeoProperty;
  refAgriFarm?: NGSIRelationship;
  structureType?: NGSIProperty;
  [key: string]: any;
}

/**
 * Union type for all known entity types
 */
export type NGSIEntityType = 
  | AgriSensor
  | AgriculturalRobot
  | AgriParcel
  | AgriFarm
  | AgriGreenhouse
  | NGSIEntity; // Fallback for unknown types

// =============================================================================
// Query and Subscription Types
// =============================================================================

/**
 * NGSI-LD Query options
 */
export interface NGSIQueryOptions {
  type?: string;
  id?: string;
  idPattern?: string;
  attrs?: string[]; // Attributes to include
  q?: string; // Query expression
  geoQ?: {
    geometry?: string;
    coordinates?: string;
    georel?: string;
    geoproperty?: string;
  };
  csfs?: string; // Context source filter
  scope?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  count?: boolean;
}

/**
 * NGSI-LD Subscription structure
 */
export interface NGSISubscription {
  id?: string;
  type: 'Subscription';
  description?: string;
  entities?: Array<{
    id?: string;
    idPattern?: string;
    type: string;
  }>;
  watchedAttributes?: string[];
  q?: string;
  geoQ?: any;
  notification: {
    attributes?: string[];
    format?: 'normalized' | 'keyValues' | 'values';
    endpoint: {
      uri: string;
      accept?: string;
      receiverInfo?: Array<{
        key: string;
        value: string;
      }>;
    };
  };
  expires?: string;
  throttling?: number;
  timeInterval?: number;
  status?: 'active' | 'paused' | 'expired' | 'failed';
  '@context'?: string | string[] | object;
}

/**
 * NGSI-LD Notification payload
 */
export interface NGSINotification {
  subscriptionId: string;
  data: NGSIEntity[];
  triggerReason?: 'newlyMatching' | 'updated' | 'noLongerMatching';
  [key: string]: any;
}

// =============================================================================
// Helper Type Guards
// =============================================================================

/**
 * Type guard to check if an attribute is a Property
 */
export function isNGSIProperty(attr: any): attr is NGSIProperty {
  return attr && attr.type === 'Property';
}

/**
 * Type guard to check if an attribute is a Relationship
 */
export function isNGSIRelationship(attr: any): attr is NGSIRelationship {
  return attr && attr.type === 'Relationship';
}

/**
 * Type guard to check if an attribute is a GeoProperty
 */
export function isNGSIGeoProperty(attr: any): attr is NGSIGeoProperty {
  return attr && attr.type === 'GeoProperty';
}

/**
 * Type guard to check if an attribute is a LanguageProperty
 */
export function isNGSILanguageProperty(attr: any): attr is NGSILanguageProperty {
  return attr && attr.type === 'LanguageProperty';
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract the value from an NGSI-LD attribute
 */
export function getNGSIValue(attr: NGSAttribute | any): any {
  if (!attr) return null;
  
  if (isNGSIProperty(attr)) {
    return attr.value;
  }
  
  if (isNGSIRelationship(attr)) {
    return attr.object;
  }
  
  if (isNGSIGeoProperty(attr)) {
    return attr.value;
  }
  
  if (isNGSILanguageProperty(attr)) {
    // Return the first language value or a specific language
    const languages = Object.keys(attr.languageMap);
    return languages.length > 0 ? attr.languageMap[languages[0]] : null;
  }
  
  // Fallback for plain values
  if (typeof attr === 'object' && 'value' in attr) {
    return attr.value;
  }
  
  return attr;
}

/**
 * Get the observed timestamp from an NGSI-LD attribute
 */
export function getNGSObservedAt(attr: NGSAttribute | any): string | null {
  if (!attr || typeof attr !== 'object') return null;
  return attr.observedAt || attr['@observedAt'] || null;
}

/**
 * Get unit code from an NGSI-LD Property
 */
export function getNGSIUnitCode(attr: NGSAttribute | any): string | null {
  if (isNGSIProperty(attr)) {
    return attr.unitCode || null;
  }
  return null;
}

