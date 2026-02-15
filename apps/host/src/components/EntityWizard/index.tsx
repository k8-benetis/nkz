/**
 * EntityWizard 2.0 - Complete Entity Creation Wizard
 * 
 * Features:
 * - 5-step wizard for creating any SDM entity type
 * - Parent-child hierarchy support with geo-fencing validation
 * - Robot provisioning with WireGuard keys and ROS namespace
 * - Vercel Blob integration for icons and 3D models
 * - Dynamic forms based on SDM schemas
 */

import {
  X, ArrowRight, ArrowLeft, Check, Loader2, Search,
  MapPin, Gauge, Bot, Building2, Droplets, Trees, Zap, Tractor,
  ChevronDown, ChevronRight, Leaf, Activity, Sun, Palette
} from 'lucide-react';
import { useReducer, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { placementReducer, INITIAL_STATE, PlacementAction } from '@/machines/placementMachine';
import { useI18n } from '@/context/I18nContext';
import { useViewer } from '@/context/ViewerContext';
import api from '@/services/api';
import { getConfig } from '@/config/environment';
import { ParentEntitySelector, ParentEntity } from './ParentEntitySelector';
import { IconUploader } from './IconUploader';
import { Model3DUploader } from './Model3DUploader';
import { AssetBrowser } from './AssetBrowser';
import { PlacementModeSelector, PlacementMode } from './PlacementModeSelector';
import { StampTool } from './StampTool';
import { RobotCredentialsModal, RobotCredentials } from './RobotCredentialsModal';
import { MqttCredentialsModal, MqttCredentials } from './MqttCredentialsModal';
import { Cable } from 'lucide-react';
import { listDeviceProfiles, DeviceProfile } from '@/services/deviceProfilesApi';
import { parcelApi } from '@/services/parcelApi';
import { DefaultIconSelector } from './DefaultIconSelector';
import { SceneComposer } from './SceneComposer';
import { validateGeometryWithinParent, isValidGeometry } from '@/utils/geometryValidation';
import { GeometryEditor } from './GeometryEditor';
import { DeviceProfileHelpModal } from '../DeviceProfileHelpModal';
import { HelpCircle } from 'lucide-react';
import type { Geometry } from 'geojson';

// =============================================================================
// Entity Type Metadata - For search, icons, and categorization
// =============================================================================
interface EntityTypeInfo {
  keywords: string[];
  macroCategory: 'assets' | 'sensors' | 'fleet';
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
}

const ENTITY_TYPE_METADATA: Record<string, EntityTypeInfo> = {
  // Assets (Activos Fijos)
  AgriParcel: { keywords: ['parcela', 'terreno', 'finca', 'campo', 'parcel', 'field'], macroCategory: 'assets', icon: MapPin, description: 'Parcela agrícola', color: 'green' },
  Vineyard: { keywords: ['viñedo', 'viña', 'uva', 'vineyard', 'grape'], macroCategory: 'assets', icon: Leaf, description: 'Viñedo', color: 'purple' },
  OliveGrove: { keywords: ['olivar', 'olivo', 'aceite', 'olive'], macroCategory: 'assets', icon: Trees, description: 'Olivar', color: 'green' },
  AgriCrop: { keywords: ['cultivo', 'cosecha', 'crop', 'harvest'], macroCategory: 'assets', icon: Leaf, description: 'Cultivo agrícola', color: 'green' },
  AgriTree: { keywords: ['árbol', 'frutal', 'tree'], macroCategory: 'assets', icon: Trees, description: 'Árbol individual', color: 'green' },
  OliveTree: { keywords: ['olivo', 'olive tree'], macroCategory: 'assets', icon: Trees, description: 'Olivo individual', color: 'green' },
  Vine: { keywords: ['vid', 'cepa', 'vine'], macroCategory: 'assets', icon: Leaf, description: 'Cepa de vid', color: 'purple' },
  FruitTree: { keywords: ['frutal', 'fruit tree', 'manzano', 'peral'], macroCategory: 'assets', icon: Trees, description: 'Árbol frutal', color: 'orange' },
  AgriBuilding: { keywords: ['edificio', 'almacén', 'bodega', 'building', 'warehouse'], macroCategory: 'assets', icon: Building2, description: 'Edificio agrícola', color: 'gray' },
  WaterSource: { keywords: ['agua', 'fuente', 'water', 'source'], macroCategory: 'assets', icon: Droplets, description: 'Fuente de agua', color: 'blue' },
  Well: { keywords: ['pozo', 'well'], macroCategory: 'assets', icon: Droplets, description: 'Pozo', color: 'blue' },
  IrrigationOutlet: { keywords: ['riego', 'gotero', 'irrigation', 'outlet'], macroCategory: 'assets', icon: Droplets, description: 'Punto de riego', color: 'blue' },
  Spring: { keywords: ['manantial', 'spring'], macroCategory: 'assets', icon: Droplets, description: 'Manantial', color: 'blue' },
  Pond: { keywords: ['estanque', 'balsa', 'pond'], macroCategory: 'assets', icon: Droplets, description: 'Estanque/Balsa', color: 'blue' },
  IrrigationSystem: { keywords: ['sistema riego', 'irrigation system'], macroCategory: 'assets', icon: Droplets, description: 'Sistema de riego', color: 'blue' },
  PhotovoltaicInstallation: { keywords: ['solar', 'fotovoltaico', 'panel', 'photovoltaic'], macroCategory: 'assets', icon: Sun, description: 'Instalación fotovoltaica', color: 'yellow' },
  EnergyStorageSystem: { keywords: ['batería', 'almacenamiento', 'battery', 'storage'], macroCategory: 'assets', icon: Zap, description: 'Sistema de almacenamiento', color: 'yellow' },

  // Sensors (Sensores e IoT)
  AgriSensor: { keywords: ['sensor', 'sonda', 'humedad', 'temperatura', 'probe'], macroCategory: 'sensors', icon: Gauge, description: 'Sensor agrícola', color: 'teal' },
  Device: { keywords: ['dispositivo', 'device', 'iot'], macroCategory: 'sensors', icon: Activity, description: 'Dispositivo IoT', color: 'teal' },
  WeatherObserved: { keywords: ['meteorología', 'clima', 'weather', 'estación', 'station', 'davis'], macroCategory: 'sensors', icon: Sun, description: 'Estación meteorológica', color: 'blue' },
  LivestockAnimal: { keywords: ['animal', 'ganado', 'vaca', 'oveja', 'livestock'], macroCategory: 'sensors', icon: Activity, description: 'Animal individual', color: 'brown' },
  LivestockGroup: { keywords: ['rebaño', 'grupo', 'herd', 'flock'], macroCategory: 'sensors', icon: Activity, description: 'Grupo de animales', color: 'brown' },
  LivestockFarm: { keywords: ['granja', 'explotación', 'farm'], macroCategory: 'sensors', icon: Building2, description: 'Explotación ganadera', color: 'brown' },

  // Fleet (Flota y Robótica)
  AgriculturalRobot: { keywords: ['robot', 'rover', 'ros2', 'autónomo', 'autonomous'], macroCategory: 'fleet', icon: Bot, description: 'Robot agrícola', color: 'indigo' },
  AgriculturalTractor: { keywords: ['tractor', 'john deere', 'fendt', 'isobus'], macroCategory: 'fleet', icon: Tractor, description: 'Tractor', color: 'green' },
  AgriculturalImplement: { keywords: ['apero', 'implemento', 'implement', 'pulverizador', 'sembradora'], macroCategory: 'fleet', icon: Tractor, description: 'Apero/Implemento', color: 'gray' },
  AgriOperation: { keywords: ['operación', 'tarea', 'operation', 'task'], macroCategory: 'fleet', icon: Activity, description: 'Operación agrícola', color: 'orange' },
};

// Macro category definitions
const MACRO_CATEGORIES = {
  assets: {
    label: 'Activos Fijos',
    description: 'Parcelas, edificios, infraestructura',
    icon: MapPin,
    color: 'green',
  },
  sensors: {
    label: 'Sensores e IoT',
    description: 'Estaciones, sondas, dispositivos',
    icon: Gauge,
    color: 'teal',
  },
  fleet: {
    label: 'Flota y Robótica',
    description: 'Tractores, robots, maquinaria',
    icon: Bot,
    color: 'indigo',
  },
} as const;

// Original categories (for detailed view)
const ENTITY_CATEGORIES = {
  'Cultivos': ['AgriCrop', 'Vineyard', 'OliveGrove', 'AgriParcel'],
  'Árboles': ['AgriTree', 'OliveTree', 'Vine', 'FruitTree'],
  'Agua': ['WaterSource', 'Well', 'IrrigationOutlet', 'Spring', 'Pond'],
  'Robótica': ['AgriculturalRobot', 'AgriculturalTractor', 'AgriculturalImplement'],
  'Sensores': ['AgriSensor', 'Device', 'WeatherObserved'],
  'Infraestructura': ['AgriBuilding', 'IrrigationSystem'],
  'Ganadería': ['LivestockAnimal', 'LivestockGroup', 'LivestockFarm'],
  'Energía': ['PhotovoltaicInstallation', 'EnergyStorageSystem'],
  'Operaciones': ['AgriOperation'],
};

const config = getConfig();

export interface EntityWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialEntityType?: string;
}

interface WizardFormData {
  // Basic info
  name: string;
  description?: string;

  // Hierarchy
  parentEntity: ParentEntity | null;
  isSubdivision: boolean;

  // Location/Geometry
  geometryType: 'Point' | 'Polygon' | 'LineString' | 'MultiLineString';
  geometry: Geometry | null;
  latitude?: number;
  longitude?: number;

  // Type-specific fields (dynamic)
  [key: string]: any;

  // Visualization
  defaultIconKey?: string;  // Key for default icon (e.g., 'leaf', 'gauge')
  iconUrl?: string;         // Custom uploaded icon URL
  model3DUrl?: string;
  modelScale?: number;
  modelRotation?: [number, number, number];

  // Placement State handled by reducer
  placementState: typeof INITIAL_STATE;
}

export const EntityWizard: React.FC<EntityWizardProps> = ({ isOpen, onClose, onSuccess, initialEntityType }) => {
  const { t } = useI18n();
  const { mapMode, startModelPreview, startStampMode, modelPlacement, updateModelPlacement } = useViewer();
  // Type assertion to bypass potential staleness in TS check
  const isMapInteractMode = (mapMode as string) === 'STAMP_INSTANCES' || (mapMode as string) === 'PREVIEW_MODEL';
  const [step, setStep] = useState(1);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [sdmEntities, setSdmEntities] = useState<any>({});
  const [entitySchema, setEntitySchema] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Placement Logic State Machine
  const [placementState, dispatchPlacement] = useReducer(placementReducer, INITIAL_STATE);

  const [formData, setFormData] = useState<WizardFormData>({
    name: '',
    description: '',
    parentEntity: null,
    isSubdivision: false,
    geometryType: 'Point',
    geometry: null,
    modelScale: 1.0,
    modelRotation: [0, 0, 0],
    placementState: INITIAL_STATE
  });

  const [robotCredentials, setRobotCredentials] = useState<RobotCredentials | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);

  // MQTT Credentials for IoT devices (Device, AgriSensor, etc.)
  const [mqttCredentials, setMqttCredentials] = useState<MqttCredentials | null>(null);
  const [showMqttCredentialsModal, setShowMqttCredentialsModal] = useState(false);
  const [showDeviceProfileHelp, setShowDeviceProfileHelp] = useState(false);

  // Device Profile for IoT data mapping
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfile[]>([]);
  const [selectedDeviceProfileId, setSelectedDeviceProfileId] = useState<string | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setError(null);
      setValidationError(null);
      setShowCredentialsModal(false);
      setShowMqttCredentialsModal(false);
      setRobotCredentials(null);
      setMqttCredentials(null);
      setLoading(false);
    }
  }, [isOpen]);

  // Step 1 search state (moved outside renderStep1 for reset access)
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMacro, setActiveMacro] = useState<'assets' | 'sensors' | 'fleet' | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Load SDM entities on mount
  useEffect(() => {
    if (isOpen) {
      loadSDMEntities();
    }
  }, [isOpen]);

  // Optimize Stamp Mode handler to prevent infinite loops
  const handleStampInstancesChange = useCallback((instances: any[]) => {
    dispatchPlacement({ type: 'ADD_STAMPED_INSTANCES', payload: instances });
    setValidationError(instances.length === 0 ? 'Please paint at least one instance' : null);
  }, []);

  // Sync 3D Model Preview (Single Placement)
  useEffect(() => {
    // Only active in Step 4, if model is selected, geometry is Point, and NOT in Stamp-mode
    if (step === 4 && formData.model3DUrl &&
      placementState.mode !== 'stamp' &&
      formData.geometry?.type === 'Point') {

      const point = formData.geometry as any;
      const coords = point.coordinates;

      if (coords && Array.isArray(coords) && coords.length >= 2) {
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);

        if (!isNaN(lon) && !isNaN(lat)) {
          startModelPreview(formData.model3DUrl, {
            position: { lat, lon },
            scale: formData.modelScale || 1.0,
            rotation: formData.modelRotation || [0, 0, 0]
          });
        }
      }
    }
  }, [step, formData.model3DUrl, formData.modelScale, formData.modelRotation, formData.geometry, placementState.mode, startModelPreview]);

  // Load schema when entity type changes
  useEffect(() => {
    if (entityType && isOpen) {
      loadEntitySchema(entityType);
    }
  }, [entityType, isOpen]);

  // Reset on open
  useEffect(() => {
    setStep(1);
    setEntityType(initialEntityType || null);
    setFormData({
      name: '',
      description: '',
      parentEntity: null,
      isSubdivision: false,
      geometryType: 'Point',
      geometry: null,
      modelScale: 1.0,
      modelRotation: [0, 0, 0],
      placementState: INITIAL_STATE
    });
    dispatchPlacement({ type: 'RESET' });
    setError(null);
    setValidationError(null);
    setRobotCredentials(null);
    setShowCredentialsModal(false);
    // Reset search state
    setSearchTerm('');
    setActiveMacro(null);
    setExpandedCategories(new Set());

    // If initial type is provided, skip to step 2 automatically?
    // Maybe better to stay on step 1 but with type selected, so user sees what they are creating.
    if (initialEntityType) {
      // Maybe auto-advance if it's a specific type?
      // Let's just select it for now.
    }
  }, [isOpen, initialEntityType]);

  const loadSDMEntities = async () => {
    try {
      const entities = await api.getSDMEntities();
      setSdmEntities(entities);
    } catch (error) {
      console.error('Error loading SDM entities:', error);
    }
  };

  const loadEntitySchema = async (type: string) => {
    try {
      const schema = await api.getSDMEntitySchema(type);
      setEntitySchema(schema);

      // Load device profiles for sensor types
      const typeInfo = ENTITY_TYPE_METADATA[type as keyof typeof ENTITY_TYPE_METADATA];
      if (typeInfo?.macroCategory === 'sensors') {
        try {
          const profiles = await listDeviceProfiles({ sdm_entity_type: type });
          setDeviceProfiles(profiles);
        } catch (profileErr) {
          console.warn('Could not load device profiles:', profileErr);
          setDeviceProfiles([]);
        }
      } else {
        setDeviceProfiles([]);
      }
    } catch (error) {
      console.error(`Error loading schema for ${type}:`, error);
    }
  };

  const handleNext = () => {
    setError(null);
    setValidationError(null);

    if (step === 1 && !entityType) {
      setError('Please select an entity type');
      return;
    }

    if (step === 2) {
      if (!formData.name.trim()) {
        setError('Name is required');
        return;
      }
      // Stamp mode validation
      if (placementState.mode === 'stamp' && !formData.model3DUrl) {
        setError('Please select a 3D model for stamp mode');
        return;
      }
    }

    if (step === 3) {
      // Validate geometry
      if (placementState.mode === 'stamp') {
        if (placementState.stampedInstances.length === 0) {
          setError('Please paint at least one instance');
          return;
        }
      } else if (!formData.geometry && formData.geometryType !== 'Point') {
        setError('Please draw the geometry on the map');
        return;
      }

      // Validate geo-fencing if subdivision
      if (formData.isSubdivision && formData.parentEntity && formData.geometry) {
        const validation = validateGeometryWithinParent(
          formData.geometry,
          formData.parentEntity.geometry
        );

        if (!validation.valid) {
          setValidationError(validation.error || 'Geometry validation failed');
          return;
        }
      }
    }

    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
    setError(null);
    setValidationError(null);
  };

  const buildNGSILDEntity = (): any => {
    const tenantId = 'current'; // Will be extracted from auth context
    const entityId = `urn:ngsi-ld:${entityType}:${tenantId}:${Date.now()}`;

    const entity: any = {
      id: entityId,
      type: entityType,
      '@context': [config.external.contextUrl],
      name: {
        type: 'Property',
        value: formData.name
      }
    };

    // Description
    if (formData.description) {
      entity.description = {
        type: 'Property',
        value: formData.description
      };
    }

    // Location/Geometry
    if (placementState.mode === 'stamp' && placementState.stampedInstances.length > 0) {
      // Create MultiPoint from stamped instances
      const coordinates = placementState.stampedInstances.map((inst) => [inst.lng, inst.lat]);

      entity.location = {
        type: 'GeoProperty',
        value: {
          type: 'MultiPoint',
          coordinates: coordinates
        }
      };
    } else if (formData.geometry) {
      entity.location = {
        type: 'GeoProperty',
        value: formData.geometry
      };
    } else if (formData.latitude && formData.longitude) {
      entity.location = {
        type: 'GeoProperty',
        value: {
          type: 'Point',
          coordinates: [formData.longitude, formData.latitude]
        }
      };
    }

    // Parent relationship
    if (formData.isSubdivision && formData.parentEntity) {
      entity.refParent = {
        type: 'Relationship',
        object: formData.parentEntity.id
      };
    }

    // Icon - custom URL or default key (Mapped to icon2d for frontend consistency)
    if (formData.iconUrl) {
      entity.icon2d = {
        type: 'Property',
        value: formData.iconUrl
      };
    } else if (formData.defaultIconKey) {
      entity.icon2d = {
        type: 'Property',
        value: `icon:${formData.defaultIconKey}`  // Reference to default icon
      };
    }

    // 3D Model
    if (formData.model3DUrl) {
      entity.ref3DModel = {
        type: 'Property',
        value: formData.model3DUrl
      };
      if (formData.modelScale) {
        entity.modelScale = {
          type: 'Property',
          value: formData.modelScale
        };
      }
      if (formData.modelRotation) {
        entity.modelRotation = {
          type: 'Property',
          value: formData.modelRotation
        };
      }
    }

    // Device Profile (IoT)
    if (selectedDeviceProfileId) {
      entity.refDeviceProfile = {
        type: 'Relationship',
        object: selectedDeviceProfileId.startsWith('urn:') ? selectedDeviceProfileId : `urn:ngsi-ld:DeviceProfile:${selectedDeviceProfileId}`
      };
    }

    // Type-specific attributes (from dynamic form)
    Object.keys(formData).forEach(key => {
      if (!['name', 'description', 'parentEntity', 'isSubdivision', 'geometryType', 'geometry',
        'latitude', 'longitude', 'iconUrl', 'model3DUrl', 'modelScale', 'modelRotation'].includes(key)) {
        const value = formData[key];
        if (value !== undefined && value !== null && value !== '') {
          entity[key] = {
            type: 'Property',
            value: value
          };
        }
      }
    });

    return entity;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setValidationError(null);

    try {
      // Special handling for robots
      if (entityType === 'AgriculturalRobot') {
        const robotData = {
          name: formData.name,
          location: formData.geometry ? {
            type: 'GeoProperty',
            value: formData.geometry
          } : (formData.latitude && formData.longitude ? {
            type: 'GeoProperty',
            value: {
              type: 'Point',
              coordinates: [formData.longitude, formData.latitude]
            }
          } : undefined),
          robotType: formData.robotType,
          model: formData.model,
          manufacturer: formData.manufacturer,
          serialNumber: formData.serialNumber,
          icon: formData.iconUrl,
          ref3DModel: formData.model3DUrl,
          modelScale: formData.modelScale,
          modelRotation: formData.modelRotation
        };

        const response = await api.provisionRobot(robotData);
        setRobotCredentials(response.credentials);
        setShowCredentialsModal(true);

        if (onSuccess) onSuccess();
        // Don't close yet - wait for user to save credentials
        return;
      }

      // Special handling for AgriParcel - use dedicated parcelApi for correct NGSI-LD structure
      if (entityType === 'AgriParcel') {
        const parcelData = {
          name: formData.name,
          geometry: formData.geometry,
          municipality: formData.municipality || '',
          province: formData.province || '',
          cadastralReference: formData.cadastralReference,
          cropType: formData.cropType || '',
          notes: formData.description,
          ndviEnabled: true
        };

        await parcelApi.createParcel(parcelData);
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      // For other entities, use SDM creation
      const entity = buildNGSILDEntity();
      // DEBUG: Alert before sending
      // if (entityType?.includes('Sensor')) alert("Sending creation request...");

      const response = await api.createSDMEntity(entityType!, entity);

      // Check if this is an IoT device with MQTT credentials
      if (response && response.mqtt_credentials) {
        setMqttCredentials(response.mqtt_credentials);
        setShowMqttCredentialsModal(true);
        // Do NOT call onSuccess() here. 
        // Calling it would trigger the parent to close this Wizard, hiding the credentials modal.
        // We defer onSuccess() to handleMqttCredentialsSaved.
        return;
      } else {
        // DEBUG: Alert if no credentials
        if (entityType?.includes('Sensor')) {
          console.warn("Sensor created but no credentials returned", response);
        }
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating entity:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to create entity';
      setError(msg);
      // DEBUG: Alert on error to ensure user sees it
      if (entityType?.includes('Sensor')) {
        alert(`Sensor Creation Error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSaved = () => {
    setShowCredentialsModal(false);
    setRobotCredentials(null);
    onClose();
  };

  const handleMqttCredentialsSaved = () => {
    setShowMqttCredentialsModal(false);
    setMqttCredentials(null);
    // Now we can close the wizard and refresh
    if (onSuccess) onSuccess();
    onClose();
  };

  // Step 1: Type Selection with Smart Search
  // Filter entity types based on search and macro category
  // NOTE: useMemo hooks MUST be called before any conditional returns!
  const filteredEntityTypes = useMemo(() => {
    const allTypes = Object.keys(ENTITY_TYPE_METADATA);

    return allTypes.filter(type => {
      const meta = ENTITY_TYPE_METADATA[type];
      if (!meta) return false;

      // Filter by macro category if selected
      if (activeMacro && meta.macroCategory !== activeMacro) return false;

      // Filter by search term
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        const matchesType = type.toLowerCase().includes(search);
        const matchesKeywords = meta.keywords.some(k => k.toLowerCase().includes(search));
        const matchesDescription = meta.description.toLowerCase().includes(search);
        return matchesType || matchesKeywords || matchesDescription;
      }

      return true;
    });
  }, [searchTerm, activeMacro]);

  // Group filtered types by category
  const groupedFilteredTypes = useMemo(() => {
    const groups: Record<string, string[]> = {};

    Object.entries(ENTITY_CATEGORIES).forEach(([category, types]) => {
      const filtered = types.filter(t => filteredEntityTypes.includes(t));
      if (filtered.length > 0) {
        groups[category] = filtered;
      }
    });

    return groups;
  }, [filteredEntityTypes]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Early return AFTER all hooks are called
  // Hide wizard during 3D placement modes so user can see the terrain
  if (!isOpen || mapMode === 'PREVIEW_MODEL' || mapMode === 'STAMP_INSTANCES' || mapMode === 'DRAW_GEOMETRY') return null;

  const getColorClasses = (color: string, isSelected: boolean) => {
    const colors: Record<string, { border: string; bg: string; text: string }> = {
      green: { border: 'border-green-500', bg: 'bg-green-50', text: 'text-green-700' },
      teal: { border: 'border-teal-500', bg: 'bg-teal-50', text: 'text-teal-700' },
      indigo: { border: 'border-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700' },
      blue: { border: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
      purple: { border: 'border-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
      orange: { border: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' },
      yellow: { border: 'border-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700' },
      brown: { border: 'border-amber-600', bg: 'bg-amber-50', text: 'text-amber-700' },
      gray: { border: 'border-gray-500', bg: 'bg-gray-50', text: 'text-gray-700' },
    };
    const c = colors[color] || colors.gray;
    return isSelected ? `${c.border} ${c.bg}` : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50';
  };

  const renderStep1 = () => {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold mb-2">¿Qué quieres crear?</h3>
          <p className="text-sm text-gray-600">
            Busca por nombre, tipo o fabricante, o selecciona una categoría.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar: tractor, sensor humedad, Davis, John Deere..."
            className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Macro Categories */}
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(MACRO_CATEGORIES) as [keyof typeof MACRO_CATEGORIES, typeof MACRO_CATEGORIES[keyof typeof MACRO_CATEGORIES]][]).map(([key, macro]) => {
            const Icon = macro.icon;
            const isActive = activeMacro === key;
            return (
              <button
                key={key}
                onClick={() => setActiveMacro(isActive ? null : key)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${isActive
                  ? `border-${macro.color}-500 bg-${macro.color}-50 shadow-sm`
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                style={isActive ? {
                  borderColor: macro.color === 'green' ? '#22c55e' : macro.color === 'teal' ? '#14b8a6' : '#6366f1',
                  backgroundColor: macro.color === 'green' ? '#f0fdf4' : macro.color === 'teal' ? '#f0fdfa' : '#eef2ff'
                } : {}}
              >
                <Icon className={`w-6 h-6 mb-2 ${isActive ? `text-${macro.color}-600` : 'text-gray-500'}`}
                  style={isActive ? { color: macro.color === 'green' ? '#16a34a' : macro.color === 'teal' ? '#0d9488' : '#4f46e5' } : {}}
                />
                <div className="font-semibold text-sm">{macro.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{macro.description}</div>
              </button>
            );
          })}
        </div>

        {/* Search Results or Categories */}
        {searchTerm.trim() ? (
          // Search Results Mode
          <div className="space-y-2">
            <div className="text-sm text-gray-600 mb-2">
              {filteredEntityTypes.length} resultado{filteredEntityTypes.length !== 1 ? 's' : ''} para "{searchTerm}"
            </div>
            {filteredEntityTypes.length === 0 ? (
              <div className="p-6 text-center bg-gray-50 rounded-xl">
                <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No se encontraron resultados</p>
                <p className="text-sm text-gray-400 mt-1">Prueba con otro término o selecciona una categoría</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {filteredEntityTypes.map(type => {
                  const meta = ENTITY_TYPE_METADATA[type];
                  const Icon = meta?.icon || Activity;
                  const isSelected = entityType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => { setEntityType(type); setError(null); }}
                      className={`p-3 rounded-lg border-2 text-left transition flex items-start gap-3 ${getColorClasses(meta?.color || 'gray', isSelected)
                        }`}
                    >
                      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSelected ? 'text-current' : 'text-gray-400'}`} />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{type}</div>
                        <div className="text-xs text-gray-500 truncate">{meta?.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // Category Browser Mode
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {Object.entries(groupedFilteredTypes).map(([category, types]) => (
              <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                >
                  <span className="font-medium text-sm text-gray-700">{category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{types.length}</span>
                    {expandedCategories.has(category) ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>
                {expandedCategories.has(category) && (
                  <div className="p-2 grid grid-cols-2 gap-2 bg-white">
                    {types.map(type => {
                      const meta = ENTITY_TYPE_METADATA[type];
                      const Icon = meta?.icon || Activity;
                      const isSelected = entityType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => { setEntityType(type); setError(null); }}
                          className={`p-2.5 rounded-lg border-2 text-left transition flex items-center gap-2 ${getColorClasses(meta?.color || 'gray', isSelected)
                            }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-current' : 'text-gray-400'}`} />
                          <div className="min-w-0">
                            <div className="font-medium text-xs truncate">{type}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Selected Entity Summary */}
        {entityType && (
          <div className="p-4 bg-green-50 border-2 border-green-500 rounded-xl">
            <div className="flex items-center gap-3">
              {(() => {
                const meta = ENTITY_TYPE_METADATA[entityType];
                const Icon = meta?.icon || Activity;
                return <Icon className="w-6 h-6 text-green-600" />;
              })()}
              <div>
                <div className="font-semibold text-green-900">{entityType}</div>
                <div className="text-sm text-green-700">
                  {ENTITY_TYPE_METADATA[entityType]?.description || sdmEntities[entityType]?.description || 'Tipo de entidad seleccionado'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Step 2: Basic Info + Hierarchy
  const renderStep2 = () => {
    const canHaveParent = ['AgriParcel', 'Vineyard', 'OliveGrove', 'AgriBuilding'].includes(entityType || '');
    const isVegetation = ['AgriCrop', 'OliveGrove', 'Vineyard', 'AgriTree', 'OliveTree', 'Vine'].includes(entityType || '');

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Configuration</h3>
        </div>

        {/* Placement Mode Selection (Step 1.5) */}
        <div className="mb-6">
          <PlacementModeSelector
            mode={placementState.mode}
            onChange={(mode) => dispatchPlacement({ type: 'SET_MODE', payload: mode })}
            entityType={entityType || undefined}
          />
        </div>

        {placementState.mode === 'stamp' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <h4 className="font-semibold text-blue-900 mb-2">Select Asset to Stamp</h4>
            <AssetBrowser
              selectedUrl={formData.model3DUrl}
              onSelect={(url) => {
                setFormData({ ...formData, model3DUrl: url });
                dispatchPlacement({ type: 'SELECT_MODEL', payload: url });
              }}
              scale={formData.modelScale}
              onScaleChange={(s) => setFormData({ ...formData, modelScale: s })}
            />
            {!formData.model3DUrl && (
              <p className="text-red-500 text-sm mt-2 font-medium">Please select a 3D model to proceed.</p>
            )}
          </div>
        )}

        <div>
          <h3 className="text-md font-medium text-gray-700 mb-2">Entity Details</h3>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            placeholder="Entity name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            placeholder="Optional description"
            rows={3}
          />
        </div>

        {canHaveParent && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="isSubdivision"
                checked={formData.isSubdivision}
                onChange={(e) => setFormData({
                  ...formData,
                  isSubdivision: e.target.checked,
                  parentEntity: e.target.checked ? formData.parentEntity : null
                })}
                className="w-4 h-4"
              />
              <label htmlFor="isSubdivision" className="text-sm font-medium text-gray-700">
                Create as subdivision of existing entity
              </label>
            </div>

            {formData.isSubdivision && (
              <ParentEntitySelector
                selectedParentId={formData.parentEntity?.id}
                onSelect={(parent) => setFormData({ ...formData, parentEntity: parent })}
                entityType={entityType || undefined}
              />
            )}
          </div>
        )}

        {/* Dynamic fields based on schema */}
        {entitySchema?.attributes && (
          <div className="pt-4 border-t space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Additional Attributes</h4>
            {Object.entries(entitySchema.attributes).map(([key, attr]: [string, any]) => {
              if (['name', 'description', 'location'].includes(key)) return null;

              return (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                  <input
                    type={attr.type === 'Number' ? 'number' : 'text'}
                    value={formData[key] || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      [key]: attr.type === 'Number' ? parseFloat(e.target.value) || 0 : e.target.value
                    })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder={attr.description || key}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Device Profile Selector for Sensors */}
        {ENTITY_TYPE_METADATA[entityType as keyof typeof ENTITY_TYPE_METADATA]?.macroCategory === 'sensors' && (
          <div className="pt-4 border-t bg-purple-50 p-4 rounded-xl border border-purple-100 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Cable className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-800">Conectividad IoT y Datos</h4>
                <p className="text-xs text-purple-700">Configura cómo este dispositivo enviará datos</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Profile Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Perfil de Dispositivo (Mapeo de Datos)
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedDeviceProfileId || ''}
                    onChange={(e) => setSelectedDeviceProfileId(e.target.value || null)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    <option value="">-- Sin perfil (Configurar manualmente después) --</option>
                    {deviceProfiles.filter(p => p.is_public).length > 0 && (
                      <optgroup label="🏛️ Perfiles Oficiales">
                        {deviceProfiles.filter(p => p.is_public).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {deviceProfiles.filter(p => !p.is_public).length > 0 && (
                      <optgroup label="🏠 Mis Perfiles">
                        {deviceProfiles.filter(p => !p.is_public).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  <button
                    onClick={() => setShowDeviceProfileHelp(true)}
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center justify-center transition-colors"
                    title="Ayuda y Plantillas"
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Direct Actions & Info */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeviceProfileHelp(true);
                  }}
                  className="flex items-center justify-center gap-2 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 py-2 rounded-lg transition-colors border border-purple-200"
                >
                  <Activity className="w-3 h-3" />
                  Ver Plantillas
                </button>

                <label className="flex items-center justify-center gap-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 py-2 rounded-lg transition-colors border border-blue-200 cursor-pointer">
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const json = JSON.parse(event.target?.result as string);
                            // Validate required fields
                            if (json.name && json.sdm_entity_type && Array.isArray(json.mappings)) {
                              // Create profile from JSON
                              import('@/services/deviceProfilesApi').then(({ createDeviceProfile }) => {
                                createDeviceProfile({
                                  name: json.name,
                                  description: json.description || '',
                                  sdm_entity_type: json.sdm_entity_type,
                                  mappings: json.mappings,
                                  is_public: false // User profiles are private
                                }).then((result) => {
                                  alert(`Perfil "${json.name}" importado correctamente. Selecciónalo de la lista.`);
                                  // Refresh device profiles
                                  import('@/services/deviceProfilesApi').then(({ listDeviceProfiles }) => {
                                    listDeviceProfiles({ sdm_entity_type: entityType || undefined }).then(setDeviceProfiles);
                                  });
                                }).catch((err) => {
                                  alert(`Error al importar perfil: ${err.message || 'Error desconocido'}`);
                                });
                              });
                            } else {
                              alert('El JSON debe contener: name, sdm_entity_type y mappings[]');
                            }
                          } catch (err) {
                            alert('Error al leer el archivo JSON. Verifica el formato.');
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = ''; // Reset input
                      }
                    }}
                  />
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Importar JSON
                </label>

                <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 py-2 rounded-lg dashed">
                  <Zap className="w-3 h-3 text-yellow-500" />
                  Credenciales MQTT al finalizar
                </div>
              </div>

              <p className="text-xs text-gray-500 italic">
                * Si no seleccionas un perfil ahora, podrás configurar el mapeo JSON manualmente desde el panel de "Conectividad" una vez creada la entidad.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Step 3: Location/Geometry
  const renderStep3 = () => {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Location & Geometry</h3>
        </div>

        {/* Geometry type selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Geometry Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {['Point', 'Polygon', 'LineString', 'MultiLineString'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setFormData({
                    ...formData,
                    geometryType: type as any,
                    geometry: null
                  });
                  setValidationError(null);
                }}
                className={`p-2 rounded border text-sm ${formData.geometryType === type
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:border-green-200'
                  }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Geometry Editor or Stamp Tool */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {placementState.mode === 'stamp'
              ? 'Paint instances on map'
              : (formData.geometryType === 'Point' ? 'Click on map to select location' : 'Draw geometry on map')}
          </label>

          {placementState.mode === 'stamp' ? (
            <StampTool
              modelUrl={formData.model3DUrl}
              onInstancesChange={handleStampInstancesChange}
              height="h-96"
              disabled={loading}
            />
          ) : (
            <GeometryEditor
              geometryType={placementState.mode === 'single' ? formData.geometryType : 'Point'} // Force point for single if applicable, logic tailored
              parentGeometry={formData.isSubdivision && formData.parentEntity ? {
                id: formData.parentEntity.id,
                name: formData.parentEntity.name,
                geometry: formData.parentEntity.geometry
              } : undefined}
              initialGeometry={formData.geometry || undefined}
              onGeometryChange={(geometry) => {
                if (geometry) {
                  if (geometry.type === 'Point') {
                    const point = geometry as any;
                    setFormData({
                      ...formData,
                      latitude: point.coordinates[1],
                      longitude: point.coordinates[0],
                      geometry: geometry
                    });
                  } else {
                    setFormData({
                      ...formData,
                      geometry: geometry
                    });
                  }
                  setValidationError(null);
                } else {
                  setFormData({
                    ...formData,
                    geometry: null,
                    latitude: undefined,
                    longitude: undefined
                  });
                }
              }}
              onValidationChange={(isValid, error) => {
                if (!isValid && error) {
                  setValidationError(error);
                } else {
                  setValidationError(null);
                }
              }}
              height="h-96"
              disabled={loading}
            />
          )}
        </div>

        {/* Show parent geometry if subdivision */}
        {formData.isSubdivision && formData.parentEntity && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Parent:</strong> {formData.parentEntity.name} ({formData.parentEntity.type})
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              The geometry you draw must be completely within the parent's boundaries.
            </p>
          </div>
        )}

        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{validationError}</p>
          </div>
        )}
      </div>
    );
  };

  // Step 4: Visualization
  const renderStep4 = () => {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Visualización</h3>
          <p className="text-sm text-gray-600">
            Configura cómo se verá esta entidad en el mapa y en las listas.
          </p>
        </div>

        {/* Default Icon Selector */}
        <div className="bg-gray-50 rounded-xl p-4">
          <DefaultIconSelector
            entityType={entityType || undefined}
            selectedIcon={formData.defaultIconKey || null}
            onSelect={(iconKey) => setFormData({
              ...formData,
              defaultIconKey: iconKey || undefined,
              // Clear custom icon if selecting default
              iconUrl: iconKey ? undefined : formData.iconUrl
            })}
          />
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-sm text-gray-500">o sube un icono personalizado</span>
          </div>
        </div>

        {/* Custom Icon Upload */}
        <IconUploader
          currentIconUrl={formData.iconUrl}
          onUpload={(url) => setFormData({
            ...formData,
            iconUrl: url,
            // Clear default icon if uploading custom
            defaultIconKey: undefined
          })}
          onRemove={() => setFormData({ ...formData, iconUrl: undefined })}
        />

        {/* 3D Model Section */}
        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">Modelo 3D (Opcional)</h4>

          {/* Asset Browser (Library + Upload) */}
          <AssetBrowser
            selectedUrl={formData.model3DUrl}
            onSelect={(url) => setFormData({ ...formData, model3DUrl: url })}

            // Scale & Rotation
            scale={formData.modelScale || 1.0}
            onScaleChange={(scale) => setFormData({ ...formData, modelScale: scale })}
            rotation={formData.modelRotation || [0, 0, 0]}
            onRotationChange={(rotation) => setFormData({ ...formData, modelRotation: rotation })}
          />

          {/* Scene Composer - Preview on Terrain button when model is uploaded */}
          {formData.model3DUrl && (
            <div className="mt-4 space-y-4">
              {/* Preview Controls */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-medium text-gray-800 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-blue-600" />
                    Ajuste Visual
                  </h5>
                  <span className="text-xs text-gray-500">
                    Escala: {(formData.modelScale || 1).toFixed(1)}x · Rotación: {formData.modelRotation?.[0] || 0}°
                  </span>
                </div>

                {/* Preview on Terrain Button */}
                <button
                  type="button"
                  onClick={() => {
                    // Validate that we have position data
                    if (!formData.latitude || !formData.longitude) {
                      alert('Por favor, selecciona primero una ubicación en el Paso 3');
                      return;
                    }
                    // Start model preview mode - wizard will hide via mapMode
                    startModelPreview(formData.model3DUrl!, {
                      lat: formData.latitude,
                      lon: formData.longitude,
                    }, {
                      scale: formData.modelScale || 1,
                      rotation: formData.modelRotation || [0, 0, 0],
                    });
                  }}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-md hover:shadow-lg"
                >
                  <MapPin className="w-5 h-5" />
                  Previsualizar en el Terreno
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  El wizard se ocultará. Ajusta escala y rotación sobre el mapa real.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Step 5: Summary & Submit
  const renderStep5 = () => {
    // Get the icon to display in summary
    const SummaryIcon = entityType ? ENTITY_TYPE_METADATA[entityType]?.icon : Activity;

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Resumen</h3>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-blue-50 p-5 rounded-xl border border-green-200 space-y-3">
          {/* Header with icon */}
          <div className="flex items-center gap-3 pb-3 border-b border-green-200">
            {SummaryIcon && <SummaryIcon className="w-8 h-8 text-green-600" />}
            <div>
              <div className="font-bold text-lg text-gray-900">{formData.name}</div>
              <div className="text-sm text-gray-600">{entityType}</div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {formData.description && (
              <div className="col-span-2">
                <span className="text-gray-500">Descripción:</span>
                <span className="ml-2 text-gray-900">{formData.description}</span>
              </div>
            )}
            {formData.isSubdivision && formData.parentEntity && (
              <div>
                <span className="text-gray-500">Padre:</span>
                <span className="ml-2 text-gray-900">{formData.parentEntity.name}</span>
              </div>
            )}
            {formData.latitude && formData.longitude && (
              <div>
                <span className="text-gray-500">Ubicación:</span>
                <span className="ml-2 text-gray-900 font-mono text-xs">
                  {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                </span>
              </div>
            )}
            {formData.geometry && formData.geometry.type !== 'Point' && (
              <div>
                <span className="text-gray-500">Geometría:</span>
                <span className="ml-2 text-gray-900">{formData.geometry.type}</span>
              </div>
            )}
          </div>

          {/* Visual assets */}
          <div className="flex gap-4 pt-3 border-t border-green-200">
            {(formData.defaultIconKey || formData.iconUrl) && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  {formData.iconUrl ? (
                    <img src={formData.iconUrl} alt="Icon" className="w-6 h-6 object-contain" />
                  ) : formData.defaultIconKey ? (
                    (() => {
                      const meta = ENTITY_TYPE_METADATA[entityType || ''];
                      const Icon = meta?.icon || Activity;
                      return <Icon className="w-5 h-5 text-gray-600" />;
                    })()
                  ) : null}
                </div>
                <span className="text-gray-600">Icono {formData.iconUrl ? 'personalizado' : 'por defecto'}</span>
              </div>
            )}
            {formData.model3DUrl && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-gray-600" />
                </div>
                <span className="text-gray-600">Modelo 3D</span>
              </div>
            )}
          </div>
        </div>

        {/* Info message based on entity type */}
        {entityType === 'AgriculturalRobot' && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Nota:</strong> Al crear el robot, recibirás las credenciales WireGuard para la conexión VPN.
              Guárdalas de forma segura.
            </p>
          </div>
        )}

        <div className="text-sm text-gray-600">
          Revisa la información y haz clic en "Crear Entidad" para continuar.
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`fixed inset-0 z-50 flex items-center justify-center 
        ${mapMode === 'DRAW_GEOMETRY'
          ? 'hidden'
          : isMapInteractMode
            ? 'pointer-events-none'
            : 'bg-black bg-opacity-50 p-4'
        }`}>
        <div className={`bg-white shadow-xl flex flex-col transition-all duration-300
          ${isMapInteractMode
            ? 'absolute top-20 right-4 w-96 max-h-[80vh] pointer-events-auto rounded-xl border border-gray-200'
            : 'rounded-2xl max-w-4xl w-full max-h-[90vh]'
          }`}>
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b flex justify-between items-center sticky top-0 z-10 rounded-t-2xl">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Create New Entity (v1.1)</h2>
              <p className="text-sm text-gray-500">Step {step} of 5</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 flex-1 overflow-y-auto">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t flex justify-between items-center rounded-b-2xl">
            <button
              onClick={handleBack}
              disabled={step === 1 || loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${step === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'
                }`}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            {step < 5 ? (
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    Create Entity <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Blocking Loading Overlay - Prevents dismissal and shows activity */}
      {loading && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center border border-slate-100 max-w-sm w-full mx-4">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin relative z-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 animate-pulse text-center">Creando Sensor...</h3>
            <p className="text-slate-600 mt-2 text-center text-sm">Configurando dispositivo IoT en el servidor.</p>
            <div className="mt-4 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-blue-500 animate-progress-indeterminate"></div>
            </div>
            <p className="text-slate-400 text-xs mt-3 font-mono text-center">No cierre esta ventana, por favor.</p>
          </div>
        </div>
      )}

      {/* Robot Credentials Modal */}
      {showCredentialsModal && robotCredentials && (
        <RobotCredentialsModal
          isOpen={showCredentialsModal}
          onClose={handleCredentialsSaved}
          robotName={formData.name}
          credentials={robotCredentials}
        />
      )}

      {/* MQTT Credentials Modal for IoT Devices */}
      {showMqttCredentialsModal && mqttCredentials && (
        <MqttCredentialsModal
          isOpen={showMqttCredentialsModal}
          onClose={handleMqttCredentialsSaved}
          deviceName={formData.name}
          credentials={mqttCredentials}
        />
      )}

      {/* Device Profile Help Modal */}
      <DeviceProfileHelpModal
        isOpen={showDeviceProfileHelp}
        onClose={() => setShowDeviceProfileHelp(false)}
      />
    </>
  );
};
