
import { 
  ThermometerSnowflake, Flame, Wind, Sun, CloudRain, Droplets, 
  Waves, Biohazard, Bug, Calendar, Activity, ShieldAlert
} from 'lucide-react';

export type RiskCategory = 'Climate' | 'WaterSoil' | 'Fungi' | 'Pests';

export interface RiskPreset {
  id: string;
  category: RiskCategory;
  name: string;
  description: string;
  params: string[];
  fallbackStrategy: string;
  icon: any;
  thresholds: {
    high: string;
    medium: string;
  };
}

export const RISK_CATALOG: RiskPreset[] = [
  // CATEGORÍA 1: CLIMÁTICOS
  {
    id: 'frost_spring',
    category: 'Climate',
    name: 'Helada Primaveral',
    description: 'Riesgo crítico en floración por temperaturas bajo cero.',
    params: ['airTemperature', 'dewPoint', 'windSpeed'],
    fallbackStrategy: 'AEMET Station / Open-Meteo Interpolation',
    icon: ThermometerSnowflake,
    thresholds: { high: '< 0°C', medium: '0-3°C' }
  },
  {
    id: 'heat_stress',
    category: 'Climate',
    name: 'Golpe de Calor',
    description: 'Estrés por calor extremo y baja humedad.',
    params: ['airTemperature', 'relativeHumidity'],
    fallbackStrategy: 'Regional Weather Grid',
    icon: Flame,
    thresholds: { high: '> 35°C & HR < 30%', medium: '> 32°C' }
  },
  {
    id: 'hail_proxy',
    category: 'Climate',
    name: 'Riesgo de Granizo',
    description: 'Caída brusca de presión y temperatura con lluvia.',
    params: ['airTemperature', 'atmosphericPressure', 'precipitation'],
    fallbackStrategy: 'Satellite Cloud Albedo + Radar Doppler',
    icon: CloudRain,
    thresholds: { high: 'ΔP > 5hPa & ΔT > 8°C', medium: 'ΔP > 3hPa' }
  },
  {
    id: 'wind_damage',
    category: 'Climate',
    name: 'Daño por Viento',
    description: 'Peligro de rotura de ramas o caída de frutos.',
    params: ['windSpeed', 'windDirection'],
    fallbackStrategy: 'Airport METAR / Local Anemometers',
    icon: Wind,
    thresholds: { high: '> 60 km/h', medium: '> 40 km/h' }
  },
  {
    id: 'sunburn',
    category: 'Climate',
    name: 'Insolación de Fruto',
    description: 'Daño por radiación solar directa intensa.',
    params: ['solarRadiation', 'airTemperature'],
    fallbackStrategy: 'CAMS Solar Radiation Service',
    icon: Sun,
    thresholds: { high: '> 850 W/m2 & T > 33°C', medium: '> 700 W/m2' }
  },
  {
    id: 'fire_30_30_30',
    category: 'Climate',
    name: 'Riesgo de Incendio (30-30-30)',
    description: 'Regla clásica de incendio agrícola/forestal.',
    params: ['airTemperature', 'relativeHumidity', 'windSpeed'],
    fallbackStrategy: 'EFFIS / Copernicus Fire Service',
    icon: ShieldAlert,
    thresholds: { high: 'T>30, HR<30, V>30', medium: '2/3 condiciones' }
  },

  // CATEGORÍA 2: HÍDRICOS Y SUELO
  {
    id: 'water_stress',
    category: 'WaterSoil',
    name: 'Estrés Hídrico Severo',
    description: 'Falta de agua disponible en la zona radicular.',
    params: ['soilMoistureVwc', 'airTemperature'],
    fallbackStrategy: 'FAO-56 Evapotranspiration Model (ETo)',
    icon: Droplets,
    thresholds: { high: '< 15% VWC', medium: '< 20% VWC' }
  },
  {
    id: 'waterlogging',
    category: 'WaterSoil',
    name: 'Asfixia Radicular',
    description: 'Saturación prolongada de agua en el suelo.',
    params: ['soilMoistureVwc', 'precipitation'],
    fallbackStrategy: 'Topographic Wetness Index (TWI)',
    icon: Waves,
    thresholds: { high: '> 45% VWC por 48h', medium: '> 40% VWC' }
  },
  {
    id: 'saline_stress',
    category: 'WaterSoil',
    name: 'Estrés Salino',
    description: 'Bloqueo por exceso de sales en el suelo.',
    params: ['electroConductivity', 'soilMoistureVwc'],
    fallbackStrategy: 'Historical Soil Map + Water Quality Proxy',
    icon: Activity,
    thresholds: { high: '> 4 dS/m', medium: '> 2.5 dS/m' }
  },
  {
    id: 'nutrient_leaching',
    category: 'WaterSoil',
    name: 'Lixiviación de Nutrientes',
    description: 'Lavado de fertilizantes por lluvia intensa.',
    params: ['precipitation'],
    fallbackStrategy: 'ERA5-Land Precipitation Data',
    icon: CloudRain,
    thresholds: { high: '> 40mm / 24h', medium: '> 25mm / 24h' }
  },
  {
    id: 'root_thermal_stress',
    category: 'WaterSoil',
    name: 'Estrés Térmico Radicular',
    description: 'Temperatura del suelo fuera de rango óptimo.',
    params: ['soilTemperature'],
    fallbackStrategy: 'Soil Temp Model (Air-to-Soil correlation)',
    icon: ThermometerSnowflake,
    thresholds: { high: '> 28°C o < 5°C', medium: '25-28°C o 5-8°C' }
  },

  // CATEGORÍA 3: HONGOS
  {
    id: 'oidio_gubler',
    category: 'Fungi',
    name: 'Oídio (Gubler-Thomas)',
    description: 'Riesgo de ceniza por calor y humedad sin lluvia.',
    params: ['airTemperature', 'relativeHumidity'],
    fallbackStrategy: 'Leaf Wetness Estimation (HR > 90%)',
    icon: Biohazard,
    thresholds: { high: 'T 20-30°C & HR > 80%', medium: 'T 15-20°C' }
  },
  {
    id: 'mildiu_goidanich',
    category: 'Fungi',
    name: 'Mildiu (Goidanich)',
    description: 'Riesgo tras lluvias con temperaturas cálidas.',
    params: ['airTemperature', 'precipitation', 'leafWetness'],
    fallbackStrategy: 'Virtual Leaf Wetness via Radar',
    icon: Biohazard,
    thresholds: { high: 'T > 10°C & P > 10mm', medium: 'T > 10°C & P > 5mm' }
  },
  {
    id: 'botrytis',
    category: 'Fungi',
    name: 'Botrytis (Pudrición)',
    description: 'Peligro por humedad foliar prolongada.',
    params: ['leafWetness', 'airTemperature'],
    fallbackStrategy: 'VPD (Vapor Pressure Deficit) Proxy',
    icon: Biohazard,
    thresholds: { high: 'Mojado > 12h & T 15-20°C', medium: 'Mojado > 8h' }
  },
  {
    id: 'rust_yellow',
    category: 'Fungi',
    name: 'Roya Amarilla/Parda',
    description: 'Riesgo en cereales por humedad nocturna.',
    params: ['leafWetness', 'airTemperature'],
    fallbackStrategy: 'Night Dew Estimation',
    icon: Biohazard,
    thresholds: { high: 'Mojado nocturno & T 10-15°C', medium: 'T 5-10°C' }
  },
  {
    id: 'fire_blight',
    category: 'Fungi',
    name: 'Fuego Bacteriano',
    description: 'Riesgo extremo en floración de frutales.',
    params: ['airTemperature', 'leafWetness', 'relativeHumidity'],
    fallbackStrategy: 'Phenology Stage Estimation + Weather',
    icon: Biohazard,
    thresholds: { high: 'T > 18°C & Mojado', medium: 'T > 15°C' }
  },

  // CATEGORÍA 4: PLAGAS Y FENOLOGÍA
  {
    id: 'red_spider',
    category: 'Pests',
    name: 'Araña Roja',
    description: 'Proliferación en ambientes cálidos y secos.',
    params: ['airTemperature', 'relativeHumidity'],
    fallbackStrategy: 'Regional Pest Monitoring Data',
    icon: Bug,
    thresholds: { high: 'T > 30°C & HR < 40%', medium: 'T > 25°C' }
  },
  {
    id: 'fruit_fly',
    category: 'Pests',
    name: 'Mosca de la Fruta',
    description: 'Actividad biológica según temperatura.',
    params: ['airTemperature'],
    fallbackStrategy: 'AEMET 2m Temperature Grid',
    icon: Bug,
    thresholds: { high: 'T 16-32°C', medium: 'T 12-16°C' }
  },
  {
    id: 'aphids',
    category: 'Pests',
    name: 'Pulgón',
    description: 'Riesgo por calor suave y exceso de nitrógeno.',
    params: ['airTemperature', 'vegetationIndex'],
    fallbackStrategy: 'Sentinel-2 NDVI + Temperature',
    icon: Bug,
    thresholds: { high: 'T 20-25°C & NDVI Alto', medium: 'T 15-20°C' }
  },
  {
    id: 'gdd_lobesia',
    category: 'Pests',
    name: 'Polilla del Racimo',
    description: 'Ciclo biológico por acumulación de calor (GDD).',
    params: ['airTemperature'],
    fallbackStrategy: 'Cumulative Degree Days (Tbase 10°C)',
    icon: Calendar,
    thresholds: { high: 'GDD > Umbral Generación', medium: 'GDD Cerca' }
  }
];
