import {
  MapPin, Gauge, Bot, Building2, Droplets, Trees, Zap,
  Leaf, Activity, Sun, Tractor,
} from 'lucide-react';
import type { MacroCategory } from './types';

// ─── Per-type metadata ────────────────────────────────────────────────────────

export interface EntityTypeInfo {
  keywords: string[];
  macroCategory: MacroCategory;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
}

export const ENTITY_TYPE_METADATA: Record<string, EntityTypeInfo> = {
  // ── Assets ──────────────────────────────────────────────────────────────────
  AgriParcel:               { keywords: ['parcela', 'terreno', 'finca', 'campo', 'parcel', 'field'],  macroCategory: 'assets',  icon: MapPin,     description: 'Parcela agrícola',            color: 'green'  },
  Vineyard:                 { keywords: ['viñedo', 'viña', 'uva', 'vineyard', 'grape'],               macroCategory: 'assets',  icon: Leaf,       description: 'Viñedo',                      color: 'purple' },
  OliveGrove:               { keywords: ['olivar', 'olivo', 'aceite', 'olive'],                       macroCategory: 'assets',  icon: Trees,      description: 'Olivar',                      color: 'green'  },
  AgriCrop:                 { keywords: ['cultivo', 'cosecha', 'crop', 'harvest'],                    macroCategory: 'assets',  icon: Leaf,       description: 'Cultivo agrícola',            color: 'green'  },
  AgriTree:                 { keywords: ['árbol', 'frutal', 'tree'],                                  macroCategory: 'assets',  icon: Trees,      description: 'Árbol individual',            color: 'green'  },
  OliveTree:                { keywords: ['olivo', 'olive tree'],                                      macroCategory: 'assets',  icon: Trees,      description: 'Olivo individual',            color: 'green'  },
  Vine:                     { keywords: ['vid', 'cepa', 'vine'],                                      macroCategory: 'assets',  icon: Leaf,       description: 'Cepa de vid',                 color: 'purple' },
  FruitTree:                { keywords: ['frutal', 'fruit tree', 'manzano', 'peral'],                 macroCategory: 'assets',  icon: Trees,      description: 'Árbol frutal',                color: 'orange' },
  AgriBuilding:             { keywords: ['edificio', 'almacén', 'bodega', 'building', 'warehouse'],   macroCategory: 'assets',  icon: Building2,  description: 'Edificio agrícola',           color: 'gray'   },
  WaterSource:              { keywords: ['agua', 'fuente', 'water', 'source'],                        macroCategory: 'assets',  icon: Droplets,   description: 'Fuente de agua',              color: 'blue'   },
  Well:                     { keywords: ['pozo', 'well'],                                             macroCategory: 'assets',  icon: Droplets,   description: 'Pozo',                        color: 'blue'   },
  IrrigationOutlet:         { keywords: ['riego', 'gotero', 'irrigation', 'outlet'],                 macroCategory: 'assets',  icon: Droplets,   description: 'Punto de riego',              color: 'blue'   },
  Spring:                   { keywords: ['manantial', 'spring'],                                      macroCategory: 'assets',  icon: Droplets,   description: 'Manantial',                   color: 'blue'   },
  Pond:                     { keywords: ['estanque', 'balsa', 'pond'],                                macroCategory: 'assets',  icon: Droplets,   description: 'Estanque/Balsa',              color: 'blue'   },
  IrrigationSystem:         { keywords: ['sistema riego', 'irrigation system'],                       macroCategory: 'assets',  icon: Droplets,   description: 'Sistema de riego',            color: 'blue'   },
  PhotovoltaicInstallation: { keywords: ['solar', 'fotovoltaico', 'panel', 'photovoltaic'],           macroCategory: 'assets',  icon: Sun,        description: 'Instalación fotovoltaica',    color: 'yellow' },
  EnergyStorageSystem:      { keywords: ['batería', 'almacenamiento', 'battery', 'storage'],          macroCategory: 'assets',  icon: Zap,        description: 'Sistema de almacenamiento',   color: 'yellow' },

  // ── Sensors ──────────────────────────────────────────────────────────────────
  AgriSensor:               { keywords: ['sensor', 'sonda', 'humedad', 'temperatura', 'probe'],       macroCategory: 'sensors', icon: Gauge,      description: 'Sensor agrícola',             color: 'teal'   },
  Device:                   { keywords: ['dispositivo', 'device', 'iot'],                             macroCategory: 'sensors', icon: Activity,   description: 'Dispositivo IoT',             color: 'teal'   },
  WeatherObserved:          { keywords: ['meteorología', 'clima', 'weather', 'estación', 'station', 'davis'], macroCategory: 'sensors', icon: Sun, description: 'Estación meteorológica',      color: 'blue'   },
  LivestockAnimal:          { keywords: ['animal', 'ganado', 'vaca', 'oveja', 'livestock'],           macroCategory: 'sensors', icon: Activity,   description: 'Animal individual',           color: 'brown'  },
  LivestockGroup:           { keywords: ['rebaño', 'grupo', 'herd', 'flock'],                         macroCategory: 'sensors', icon: Activity,   description: 'Grupo de animales',           color: 'brown'  },
  LivestockFarm:            { keywords: ['granja', 'explotación', 'farm'],                            macroCategory: 'sensors', icon: Building2,  description: 'Explotación ganadera',        color: 'brown'  },

  // ── Fleet ─────────────────────────────────────────────────────────────────────
  AgriculturalRobot:        { keywords: ['robot', 'rover', 'ros2', 'autónomo', 'autonomous'],         macroCategory: 'fleet',   icon: Bot,        description: 'Robot agrícola',              color: 'indigo' },
  AgriculturalTractor:      { keywords: ['tractor', 'john deere', 'fendt', 'isobus'],                 macroCategory: 'fleet',   icon: Tractor,    description: 'Tractor',                     color: 'green'  },
  AgriculturalImplement:    { keywords: ['apero', 'implemento', 'implement', 'pulverizador', 'sembradora'], macroCategory: 'fleet', icon: Tractor, description: 'Apero/Implemento',            color: 'gray'   },
  AgriOperation:            { keywords: ['operación', 'tarea', 'operation', 'task'],                  macroCategory: 'fleet',   icon: Activity,   description: 'Operación agrícola',          color: 'orange' },
};

// ─── Macro category UI metadata ───────────────────────────────────────────────

export const MACRO_CATEGORIES = {
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

// ─── Category → types grouping (for the category browser in StepTypeSelection) ─

export const ENTITY_CATEGORIES: Record<string, string[]> = {
  'Cultivos':        ['AgriCrop', 'Vineyard', 'OliveGrove', 'AgriParcel'],
  'Árboles':         ['AgriTree', 'OliveTree', 'Vine', 'FruitTree'],
  'Agua':            ['WaterSource', 'Well', 'IrrigationOutlet', 'Spring', 'Pond'],
  'Robótica':        ['AgriculturalRobot', 'AgriculturalTractor', 'AgriculturalImplement'],
  'Sensores':        ['AgriSensor', 'Device', 'WeatherObserved'],
  'Infraestructura': ['AgriBuilding', 'IrrigationSystem'],
  'Ganadería':       ['LivestockAnimal', 'LivestockGroup', 'LivestockFarm'],
  'Energía':         ['PhotovoltaicInstallation', 'EnergyStorageSystem'],
  'Operaciones':     ['AgriOperation'],
};
