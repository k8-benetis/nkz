/**
 * EntityWizard 3.0 — modular per-category wizard
 *
 * Architecture:
 *   - WizardProvider holds all form state (typed discriminated union)
 *   - placementState lives here as local useReducer (UI state, not form payload)
 *   - Steps are routed by macroCategory; step count varies per flow
 *   - Submission is delegated to pure handlers in submission/
 */

import { useReducer, useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useViewer } from '@/context/ViewerContext';
import { placementReducer, INITIAL_STATE } from '@/machines/placementMachine';
import { WizardProvider, useWizard } from './WizardContext';
import { StepTypeSelection } from './steps/StepTypeSelection';
import { StepGeoAssetConfig } from './steps/StepGeoAssetConfig';
import { StepIoTSensorConfig } from './steps/StepIoTSensorConfig';
import { StepFleetConfig } from './steps/StepFleetConfig';
import { StepGeometry } from './steps/StepGeometry';
import { StepVisualization } from './steps/StepVisualization';
import { StepSummary } from './steps/StepSummary';
import { RobotCredentialsModal, type RobotCredentials } from './RobotCredentialsModal';
import { MqttCredentialsModal, type MqttCredentials } from './MqttCredentialsModal';
import { submitGeoAsset } from './submission/submitGeoAsset';
import { submitIoTSensor } from './submission/submitIoTSensor';
import { submitFleet } from './submission/submitFleet';
import type { EntityWizardProps, GeoAssetFormData, IoTSensorFormData, FleetFormData } from './types';
import type { StepId } from './types';

// ─── Step router ──────────────────────────────────────────────────────────────

interface StepRouterProps {
  stepId: StepId;
  placementState: ReturnType<typeof placementReducer>;
  dispatchPlacement: React.Dispatch<Parameters<typeof placementReducer>[1]>;
}

function StepRouter({ stepId, placementState, dispatchPlacement }: StepRouterProps) {
  switch (stepId) {
    case 'type':        return <StepTypeSelection />;
    case 'geo-config':  return <StepGeoAssetConfig />;
    case 'iot-config':  return <StepIoTSensorConfig />;
    case 'fleet-config': return <StepFleetConfig />;
    case 'geometry':    return <StepGeometry placementState={placementState} dispatchPlacement={dispatchPlacement} />;
    case 'visualization': return <StepVisualization />;
    case 'summary':     return <StepSummary />;
    default:            return null;
  }
}

// ─── Stepper indicator ────────────────────────────────────────────────────────

function StepperIndicator() {
  const { steps, stepIndex } = useWizard();
  return (
    <div className="flex items-center gap-1 mt-1">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            i < stepIndex ? 'bg-green-500' : i === stepIndex ? 'bg-green-600 ring-2 ring-green-200' : 'bg-gray-300'
          }`} />
          {i < steps.length - 1 && <div className="w-4 h-px bg-gray-200" />}
        </div>
      ))}
      <span className="ml-2 text-xs text-gray-500">{steps[stepIndex]?.label}</span>
    </div>
  );
}

// ─── Validate current step before advancing ───────────────────────────────────

function validateStep(
  stepId: StepId,
  entityType: string | null,
  formData: GeoAssetFormData | IoTSensorFormData | FleetFormData | null,
  placementState: ReturnType<typeof placementReducer>,
): string | null {
  switch (stepId) {
    case 'type':
      return entityType ? null : 'Por favor selecciona un tipo de entidad';

    case 'geo-config':
    case 'iot-config':
    case 'fleet-config':
      return formData?.name.trim() ? null : 'El nombre es obligatorio';

    case 'geometry':
      if (placementState.mode === 'stamp') {
        return placementState.stampedInstances.length > 0 ? null : 'Pinta al menos una instancia';
      }
      // Point geometry is optional (coordinates may be unknown)
      return null;

    default:
      return null;
  }
}

// ─── Inner wizard (inside WizardProvider) ─────────────────────────────────────

interface InnerWizardProps {
  onClose: () => void;
  onSuccess?: () => void;
}

function InnerWizard({ onClose, onSuccess }: InnerWizardProps) {
  const {
    entityType, formData, currentStep,
    isFirstStep, isLastStep, goNext, goBack,
    loading, error, validationError,
    setLoading, setError, reset,
  } = useWizard();

  const { mapMode } = useViewer();
  const [placementState, dispatchPlacement] = useReducer(placementReducer, INITIAL_STATE);
  const [robotCredentials, setRobotCredentials] = useState<RobotCredentials | null>(null);
  const [mqttCredentials, setMqttCredentials] = useState<MqttCredentials | null>(null);

  const isMapInteractMode = (mapMode as string) === 'STAMP_INSTANCES'
    || (mapMode as string) === 'PREVIEW_MODEL';

  // Reset placement state when wizard resets
  useEffect(() => {
    dispatchPlacement({ type: 'RESET' });
  }, []);

  // Hide during active Cesium drawing/placement modes
  if (mapMode === 'PREVIEW_MODEL' || mapMode === 'STAMP_INSTANCES' || mapMode === 'DRAW_GEOMETRY') {
    return null;
  }

  const handleNext = () => {
    const err = validateStep(currentStep.id, entityType, formData as any, placementState);
    if (err) { setError(err); return; }
    goNext();
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!entityType || !formData) throw new Error('Estado del wizard incompleto');

      switch (formData.macroCategory) {
        case 'assets': {
          await submitGeoAsset(entityType, formData as GeoAssetFormData, placementState);
          if (onSuccess) onSuccess();
          onClose();
          break;
        }
        case 'sensors': {
          const result = await submitIoTSensor(entityType, formData as IoTSensorFormData);
          if (result.mqttCredentials) {
            setMqttCredentials(result.mqttCredentials);
            // Don't close — wait for user to save credentials
          } else {
            if (onSuccess) onSuccess();
            onClose();
          }
          break;
        }
        case 'fleet': {
          const result = await submitFleet(entityType, formData as FleetFormData);
          if (result.robotCredentials) {
            setRobotCredentials(result.robotCredentials);
            if (onSuccess) onSuccess();
            // Don't close — wait for user to save credentials
          } else {
            if (onSuccess) onSuccess();
            onClose();
          }
          break;
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Error al crear la entidad';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    reset();
    dispatchPlacement({ type: 'RESET' });
    onClose();
  }, [reset, onClose]);

  return (
    <>
      <div className={`fixed inset-0 z-50 flex items-center justify-center ${
        isMapInteractMode
          ? 'pointer-events-none'
          : 'bg-black bg-opacity-50 p-4'
      }`}>
        <div className={`bg-white shadow-xl flex flex-col transition-all duration-300 ${
          isMapInteractMode
            ? 'absolute top-20 right-4 w-96 max-h-[80vh] pointer-events-auto rounded-xl border border-gray-200'
            : 'rounded-2xl max-w-4xl w-full max-h-[90vh]'
        }`}>
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b flex justify-between items-center sticky top-0 z-10 rounded-t-2xl">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Crear Nueva Entidad</h2>
              <StepperIndicator />
            </div>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 flex-1 overflow-y-auto">
            {(error || validationError) && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error ?? validationError}
              </div>
            )}
            <StepRouter
              stepId={currentStep.id}
              placementState={placementState}
              dispatchPlacement={dispatchPlacement}
            />
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t flex justify-between items-center rounded-b-2xl">
            <button
              onClick={goBack}
              disabled={isFirstStep || loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                isFirstStep ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <ArrowLeft className="w-4 h-4" /> Atrás
            </button>

            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <>Crear Entidad <Check className="w-4 h-4" /></>}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <h3 className="text-xl font-bold text-slate-800">Creando entidad...</h3>
            <p className="text-slate-500 mt-2 text-sm text-center">No cierre esta ventana, por favor.</p>
          </div>
        </div>
      )}

      {/* Robot credentials */}
      {robotCredentials && (
        <RobotCredentialsModal
          isOpen
          onClose={() => { setRobotCredentials(null); onClose(); }}
          robotName={formData?.name ?? ''}
          credentials={robotCredentials}
        />
      )}

      {/* MQTT credentials */}
      {mqttCredentials && (
        <MqttCredentialsModal
          isOpen
          onClose={() => {
            setMqttCredentials(null);
            if (onSuccess) onSuccess();
            onClose();
          }}
          deviceName={formData?.name ?? ''}
          credentials={mqttCredentials}
        />
      )}
    </>
  );
}

// ─── Public export — wraps InnerWizard with the provider ─────────────────────

export const EntityWizard: React.FC<EntityWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialEntityType,
}) => {
  if (!isOpen) return null;
  return (
    <WizardProvider initialEntityType={initialEntityType}>
      <InnerWizard onClose={onClose} onSuccess={onSuccess} />
    </WizardProvider>
  );
};
