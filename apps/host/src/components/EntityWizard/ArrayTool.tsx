/**
 * ArrayTool - Grid-based mass placement of 3D models.
 *
 * The user clicks an anchor point on the map, then adjusts rows, columns,
 * spacing, and orientation. A live preview is rendered via CesiumStampRenderer
 * (same path as brush-stamp mode).
 */
import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Eraser, MapPin, Compass, Shuffle, Sun, Zap } from 'lucide-react';
import { useViewer } from '@/context/ViewerContext';
import { generateGrid } from '@/utils/generateGrid';
import type { PlacementState, PlacementAction } from '@/machines/placementMachine';
import { useI18n } from '@/context/I18nContext';

interface ArrayToolProps {
  modelUrl?: string;
  onInstancesChange: (instances: PlacementState['stampedInstances']) => void;
  placementState: PlacementState;
  dispatchPlacement: React.Dispatch<PlacementAction>;
  entityType?: string;
  disabled?: boolean;
}

export const ArrayTool: React.FC<ArrayToolProps> = ({
  modelUrl,
  onInstancesChange,
  placementState,
  dispatchPlacement,
  entityType,
  disabled = false,
}) => {
  const { t } = useI18n();
  const {
    stampInstances,
    pickLocation,
    setStampInstances,
    setStampModelOnly,
  } = useViewer();

  const settings = placementState.arraySettings;
  const [anchorSet, setAnchorSet] = useState(!!settings.anchor);

  // Set model URL for rendering only — no brush handler (array uses grid, not paint)
  useEffect(() => {
    if (disabled || !modelUrl) return;
    setStampModelOnly(modelUrl);
    return () => { setStampModelOnly(null); };
  }, [disabled, modelUrl, setStampModelOnly]);

  // Generate grid whenever settings change
  const gridPoints = useMemo(() => {
    if (!settings.anchor) return [];
    return generateGrid({
      anchor: settings.anchor,
      rows: settings.rows,
      columns: settings.columns,
      rowSpacing: settings.rowSpacing,
      colSpacing: settings.colSpacing,
      bearing: settings.bearing,
      scale: 1,
      minScale: settings.minScale,
      maxScale: settings.maxScale,
      randomRotation: settings.randomRotation,
    });
  }, [settings]);

  // Push computed grid into stamp instances (batch replace)
  useEffect(() => {
    if (!setStampInstances) return;
    setStampInstances(gridPoints);
  }, [gridPoints, setStampInstances]);

  // Sync to parent form (use ref to avoid infinite loop from inline callback)
  const onInstancesChangeRef = React.useRef(onInstancesChange);
  onInstancesChangeRef.current = onInstancesChange;

  useEffect(() => {
    const formatted = stampInstances.map(inst => ({
      lat: inst.lat,
      lng: inst.lon,
      height: inst.height,
      scale: inst.scale,
      rotation: inst.rotation,
    }));
    onInstancesChangeRef.current(formatted);
  }, [stampInstances]);

  const handlePickAnchor = useCallback(() => {
    pickLocation((lat: number, lon: number) => {
      dispatchPlacement({
        type: 'UPDATE_ARRAY_SETTINGS',
        payload: { anchor: { lat, lon } },
      });
      setAnchorSet(true);
    });
  }, [pickLocation, dispatchPlacement]);

  const handleClear = useCallback(() => {
    dispatchPlacement({
      type: 'UPDATE_ARRAY_SETTINGS',
      payload: { anchor: null },
    });
    setAnchorSet(false);
    if (setStampInstances) setStampInstances([]);
  }, [dispatchPlacement, setStampInstances]);

  const updateSetting = useCallback(
    (key: string, value: number) => {
      dispatchPlacement({
        type: 'UPDATE_ARRAY_SETTINGS',
        payload: { [key]: value },
      });
    },
    [dispatchPlacement],
  );

  if (disabled) return null;

  return (
    <div className="space-y-3">
      {/* Anchor */}
      {!anchorSet || !settings.anchor ? (
        <button
          type="button"
          onClick={handlePickAnchor}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
        >
          <MapPin className="w-5 h-5" />
          {t('wizard.array.clickAnchor')}
        </button>
      ) : (
        <div className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg text-sm">
          <MapPin className="w-4 h-4 text-purple-600" />
          <span className="text-purple-800 font-mono text-xs">
            {settings.anchor.lat.toFixed(6)}, {settings.anchor.lon.toFixed(6)}
          </span>
          <button
            type="button"
            onClick={handlePickAnchor}
            className="ml-auto text-xs text-purple-600 hover:text-purple-800 underline"
          >
            {t('wizard.array.changeAnchor')}
          </button>
        </div>
      )}

      {/* Grid parameters */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div>
          <label className="text-xs font-semibold text-gray-500">{t('wizard.array.rows')}</label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.rows}
            onChange={e => updateSetting('rows', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">{t('wizard.array.columns')}</label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.columns}
            onChange={e => updateSetting('columns', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">{t('wizard.array.rowSpacing')}</label>
          <input
            type="number"
            min={0.5}
            max={500}
            step={0.5}
            value={settings.rowSpacing}
            onChange={e => updateSetting('rowSpacing', Math.max(0.5, parseFloat(e.target.value) || 5))}
            className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">{t('wizard.array.colSpacing')}</label>
          <input
            type="number"
            min={0.5}
            max={500}
            step={0.5}
            value={settings.colSpacing}
            onChange={e => updateSetting('colSpacing', Math.max(0.5, parseFloat(e.target.value) || 5))}
            className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <Compass className="w-3 h-3" />
            {t('wizard.array.bearing')} ({settings.bearing}°)
          </label>
          <input
            type="range"
            min={0}
            max={359}
            value={settings.bearing}
            onChange={e => updateSetting('bearing', parseInt(e.target.value))}
            className="w-full mt-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-purple-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>N (0°)</span>
            <span>E (90°)</span>
            <span>S (180°)</span>
            <span>W (270°)</span>
          </div>
        </div>
      </div>

      {/* Scale & rotation variation */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <Shuffle className="w-3 h-3" />
          {t('wizard.array.variation')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">{t('wizard.array.minScale')}</label>
            <input
              type="number"
              min={0.1}
              max={settings.maxScale}
              step={0.05}
              value={settings.minScale}
              onChange={e => updateSetting('minScale', Math.max(0.1, parseFloat(e.target.value) || 0.9))}
              className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('wizard.array.maxScale')}</label>
            <input
              type="number"
              min={settings.minScale}
              max={5}
              step={0.05}
              value={settings.maxScale}
              onChange={e => updateSetting('maxScale', Math.max(settings.minScale, parseFloat(e.target.value) || 1.1))}
              className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.randomRotation}
            onChange={e => dispatchPlacement({
              type: 'UPDATE_ARRAY_SETTINGS',
              payload: { randomRotation: e.target.checked },
            })}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm text-gray-700">{t('wizard.array.randomRotation')}</span>
        </label>
      </div>

      {/* AgriEnergyTracker-specific controls */}
      {entityType === 'AgriEnergyTracker' && (
        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700">
            <Sun className="w-3 h-3" />
            {t('wizard.array.solarParams')}
          </div>
          <div>
            <label className="text-xs text-gray-600 flex items-center gap-1">
              {t('wizard.array.tilt')} ({settings.tilt}°)
            </label>
            <input
              type="range"
              min={0}
              max={90}
              value={settings.tilt}
              onChange={e => updateSetting('tilt', parseInt(e.target.value))}
              className="w-full mt-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-yellow-500"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>{t('wizard.array.tiltFlat')} (0°)</span>
              <span>45°</span>
              <span>{t('wizard.array.tiltVertical')} (90°)</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {t('wizard.array.nominalPower')}
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={50}
                max={10000}
                step={50}
                value={settings.nominalPower}
                onChange={e => updateSetting('nominalPower', Math.max(50, parseInt(e.target.value) || 500))}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">W</span>
            </div>
          </div>
          <div className="text-xs text-yellow-700 bg-yellow-100 rounded p-2">
            {t('wizard.array.solarHint', {
              total: String(settings.rows * settings.columns),
              power: ((settings.rows * settings.columns * settings.nominalPower) / 1000).toFixed(1),
            })}
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg border border-gray-200">
        <span className="text-sm font-medium text-gray-700">
          <span className="text-purple-600 font-bold">{settings.rows * settings.columns}</span>{' '}
          {t('wizard.array.total')}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center gap-1 transition-colors"
        >
          <Eraser className="w-4 h-4" /> {t('wizard.array.clearAnchor')}
        </button>
      </div>

      {/* Help text */}
      <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm text-purple-800">
        <p>
          <strong>{t('wizard.array.title')}:</strong>{' '}
          {t('wizard.array.description')}
        </p>
      </div>
    </div>
  );
};
