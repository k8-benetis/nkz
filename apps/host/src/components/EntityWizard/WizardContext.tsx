import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type {
  WizardFormData,
  GeoAssetFormData,
  IoTSensorFormData,
  FleetFormData,
  MacroCategory,
  StepConfig,
} from './types';
import { STEP_CONFIGS, INITIAL_STEPS } from './types';
import { ENTITY_TYPE_METADATA } from './entityTypes';

// ─── Initial form data factories ─────────────────────────────────────────────

const POLYGON_ASSET_TYPES = new Set([
  'AgriParcel', 'Vineyard', 'OliveGrove', 'AgriCrop',
  'AgriBuilding', 'IrrigationSystem', 'PhotovoltaicInstallation',
]);

function makeGeoAssetFormData(entityType: string): GeoAssetFormData {
  return {
    macroCategory: 'assets',
    name: '',
    description: '',
    geometry: null,
    geometryType: POLYGON_ASSET_TYPES.has(entityType) ? 'Polygon' : 'Point',
    parentEntity: null,
    isSubdivision: false,
    additionalAttributes: {},
    modelScale: 1.0,
    modelRotation: [0, 0, 0],
  };
}

function makeIoTSensorFormData(): IoTSensorFormData {
  return {
    macroCategory: 'sensors',
    name: '',
    description: '',
    geometry: null,
    geometryType: 'Point',
    deviceProfileId: null,
    additionalAttributes: {},
    modelScale: 1.0,
    modelRotation: [0, 0, 0],
  };
}

function makeFleetFormData(): FleetFormData {
  return {
    macroCategory: 'fleet',
    name: '',
    description: '',
    geometry: null,
    geometryType: 'Point',
    additionalAttributes: {},
    modelScale: 1.0,
    modelRotation: [0, 0, 0],
  };
}

function makeFormData(entityType: string, category: MacroCategory): WizardFormData {
  switch (category) {
    case 'assets':  return makeGeoAssetFormData(entityType);
    case 'sensors': return makeIoTSensorFormData();
    case 'fleet':   return makeFleetFormData();
  }
}

// ─── Context value shape ──────────────────────────────────────────────────────

interface WizardContextValue {
  // Selection
  entityType: string | null;
  macroCategory: MacroCategory | null;

  // Form data (discriminated union — narrows in steps via macroCategory)
  formData: WizardFormData | null;
  updateFormData: (partial: Partial<WizardFormData>) => void;

  // Navigation
  stepIndex: number;
  steps: StepConfig[];
  currentStep: StepConfig;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  goNext: () => void;
  goBack: () => void;

  // Async/error state
  loading: boolean;
  error: string | null;
  validationError: string | null;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setValidationError: (v: string | null) => void;

  // Actions
  setEntityType: (type: string) => void;
  reset: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used inside WizardProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface WizardProviderProps {
  children: React.ReactNode;
  initialEntityType?: string;
}

export function WizardProvider({ children, initialEntityType }: WizardProviderProps) {
  const [entityType, setEntityTypeState] = useState<string | null>(
    initialEntityType ?? null
  );
  const [formData, setFormData] = useState<WizardFormData | null>(() => {
    if (!initialEntityType) return null;
    const meta = ENTITY_TYPE_METADATA[initialEntityType];
    if (!meta) return null;
    return makeFormData(initialEntityType, meta.macroCategory);
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Derived
  const macroCategory = formData?.macroCategory ?? null;
  const steps: StepConfig[] = macroCategory ? STEP_CONFIGS[macroCategory] : INITIAL_STEPS;
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex] ?? steps[0];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  // ── Actions ────────────────────────────────────────────────────────────────

  const setEntityType = useCallback((type: string) => {
    const meta = ENTITY_TYPE_METADATA[type];
    if (!meta) return;

    const nextCategory = meta.macroCategory;
    const prevCategory = formData?.macroCategory;

    setEntityTypeState(type);

    if (nextCategory !== prevCategory) {
      // Category changed → fresh form data, back to type step
      setFormData(makeFormData(type, nextCategory));
      setStepIndex(0);
    } else {
      // Same category → keep existing form data (user may have filled name etc.)
      // but update defaults that depend on entityType (e.g. default geometryType)
      if (nextCategory === 'assets') {
        setFormData(prev => {
          if (!prev || prev.macroCategory !== 'assets') return makeFormData(type, 'assets');
          return {
            ...prev,
            geometryType: POLYGON_ASSET_TYPES.has(type)
              ? 'Polygon'
              : prev.geometryType === 'Polygon' ? 'Point' : prev.geometryType,
          };
        });
      }
    }
    setError(null);
    setValidationError(null);
  }, [formData?.macroCategory]);

  const updateFormData = useCallback((partial: Partial<WizardFormData>) => {
    setFormData(prev => (prev ? { ...prev, ...partial } as WizardFormData : null));
  }, []);

  const goNext = useCallback(() => {
    setError(null);
    setValidationError(null);
    setStepIndex(i => Math.min(i + 1, totalSteps - 1));
  }, [totalSteps]);

  const goBack = useCallback(() => {
    setError(null);
    setValidationError(null);
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  const reset = useCallback(() => {
    setEntityTypeState(null);
    setFormData(null);
    setStepIndex(0);
    setLoading(false);
    setError(null);
    setValidationError(null);
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────

  const value = useMemo<WizardContextValue>(() => ({
    entityType,
    macroCategory,
    formData,
    updateFormData,
    stepIndex,
    steps,
    currentStep,
    totalSteps,
    isFirstStep,
    isLastStep,
    goNext,
    goBack,
    loading,
    error,
    validationError,
    setLoading,
    setError,
    setValidationError,
    setEntityType,
    reset,
  }), [
    entityType, macroCategory, formData, updateFormData,
    stepIndex, steps, currentStep, totalSteps, isFirstStep, isLastStep,
    goNext, goBack, loading, error, validationError,
    setEntityType, reset,
  ]);

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}
