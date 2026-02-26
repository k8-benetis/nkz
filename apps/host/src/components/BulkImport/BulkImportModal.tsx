// =============================================================================
// BulkImportModal — Import entities from CSV or GeoJSON files
// =============================================================================
// Flow: Upload → Preview + configure → Create → Results
// Supported types: AgriTree, OliveTree, FruitTree, Vine, AgriSensor,
//                  AgriParcel (as points), Device, and any SDM entity type.
// =============================================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  X, Upload, FileText, CheckCircle, AlertTriangle, ChevronRight,
  ChevronLeft, MapPin, Loader2, TriangleAlert,
} from 'lucide-react';
import { parseFile } from './parsers';
import type { ImportRow } from './parsers';
import api from '@/services/api';

// ── Entity type options for bulk import (point-geometry assets) ───────────────
const ENTITY_TYPES = [
  { value: 'AgriTree',    label: 'Árbol genérico (AgriTree)' },
  { value: 'OliveTree',   label: 'Olivo (OliveTree)' },
  { value: 'FruitTree',   label: 'Árbol frutal (FruitTree)' },
  { value: 'Vine',        label: 'Cepa de viña (Vine)' },
  { value: 'AgriCrop',    label: 'Cultivo (AgriCrop)' },
  { value: 'AgriSensor',  label: 'Sensor agro (AgriSensor)' },
  { value: 'Device',      label: 'Dispositivo IoT (Device)' },
  { value: 'WaterSource', label: 'Punto de agua (WaterSource)' },
];

type Step = 'upload' | 'preview' | 'creating' | 'results';

interface Results {
  created: number;
  errors: any[];
  entityIds: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Mini spatial preview (SVG dots) ──────────────────────────────────────────
function SpatialDots({ rows }: { rows: ImportRow[] }) {
  if (rows.length === 0) return null;

  const lats = rows.map(r => r.lat as number);
  const lngs = rows.map(r => r.lng as number);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const dLat = maxLat - minLat || 0.001;
  const dLng = maxLng - minLng || 0.001;

  const W = 280, H = 160, PAD = 10;

  return (
    <svg
      width={W} height={H}
      className="rounded border border-gray-200 bg-gray-50"
      aria-label="Previsualización espacial"
    >
      {rows.map((r, i) => {
        const x = PAD + ((r.lng as number) - minLng) / dLng * (W - PAD * 2);
        const y = H - PAD - ((r.lat as number) - minLat) / dLat * (H - PAD * 2);
        return (
          <circle
            key={i}
            cx={x} cy={y} r={rows.length > 100 ? 2 : 4}
            fill="#16a34a" fillOpacity={0.7}
          />
        );
      })}
      <text x={4} y={H - 4} fontSize={9} fill="#6b7280">
        {rows.length} puntos · bbox {minLat.toFixed(4)},{minLng.toFixed(4)} → {maxLat.toFixed(4)},{maxLng.toFixed(4)}
      </text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const BulkImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep]             = useState<Step>('upload');
  const [rows, setRows]             = useState<ImportRow[]>([]);
  const [warnings, setWarnings]     = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState('OliveTree');
  const [fileName, setFileName]     = useState<string | null>(null);
  const [results, setResults]       = useState<Results | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setRows([]);
    setWarnings([]);
    setParseError(null);
    setFileName(null);
    setResults(null);
    setCreateError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── File handling ───────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setRows([]);
    setWarnings([]);
    setFileName(file.name);

    const result = await parseFile(file);
    if (!result.ok) { setParseError(result.error); return; }

    setRows(result.rows);
    setWarnings(result.warnings);
    setStep('preview');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setStep('creating');
    setCreateError(null);
    try {
      const res = await api.batchCreateEntities(entityType, rows);
      setResults({
        created:   res.created,
        errors:    res.errors ?? [],
        entityIds: res.entity_ids ?? [],
      });
      setStep('results');
      if (res.created > 0) onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Error desconocido';
      setCreateError(msg);
      setStep('preview');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Importación masiva de entidades
            </h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-gray-750 text-xs text-gray-500 flex-shrink-0 border-b border-gray-100">
          {(['upload', 'preview', 'results'] as const).map((s, i) => (
            <React.Fragment key={s}>
              <span className={`font-medium ${step === s || (step === 'creating' && s === 'preview') ? 'text-green-600' : step === 'results' && i < 2 ? 'text-gray-400' : ''}`}>
                {i + 1}. {s === 'upload' ? 'Subir fichero' : s === 'preview' ? 'Vista previa' : 'Resultado'}
              </span>
              {i < 2 && <ChevronRight className="w-3 h-3" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── Step: Upload ─────────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition"
              >
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="font-medium text-gray-700 dark:text-gray-200">
                  Arrastra aquí tu fichero o haz clic para seleccionar
                </p>
                <p className="text-sm text-gray-400 mt-1">CSV · GeoJSON — hasta 500 entidades</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.geojson,.json,.txt"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700 space-y-1">
                <p className="font-medium">Formatos soportados</p>
                <p><strong>CSV</strong>: columnas <code>lat</code>, <code>lng</code>, <code>name</code> (opcionales: <code>description</code>, otras). Delimitador coma o punto-coma.</p>
                <p><strong>GeoJSON</strong>: FeatureCollection de puntos. Las propiedades <code>name</code>/<code>description</code> se mapean automáticamente.</p>
              </div>
            </>
          )}

          {/* ── Step: Preview ────────────────────────────────────────────── */}
          {(step === 'preview' || step === 'creating') && (
            <>
              {/* Entity type selector */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Tipo de entidad:
                </label>
                <select
                  value={entityType}
                  onChange={e => setEntityType(e.target.value)}
                  disabled={step === 'creating'}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-50 bg-white dark:bg-gray-700 dark:text-white"
                >
                  {ENTITY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">{rows.length}</span> entidades de <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{fileName}</span>
                </span>
                <button
                  onClick={() => { setStep('upload'); }}
                  disabled={step === 'creating'}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  Cambiar fichero
                </button>
              </div>

              {/* Spatial preview */}
              <div className="flex justify-center">
                <SpatialDots rows={rows} />
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700 space-y-0.5 max-h-28 overflow-y-auto">
                  <p className="font-medium mb-1">{warnings.length} advertencia(s):</p>
                  {warnings.map((w, i) => <p key={i}>• {w}</p>)}
                </div>
              )}

              {/* Data table preview */}
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">#</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Lat</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Lng</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200 max-w-[160px] truncate">{r.name}</td>
                        <td className="px-3 py-1.5 text-gray-600 font-mono">{r.lat?.toFixed(5)}</td>
                        <td className="px-3 py-1.5 text-gray-600 font-mono">{r.lng?.toFixed(5)}</td>
                        <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate">{r.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 8 && (
                  <p className="text-xs text-center text-gray-400 py-2">
                    … y {rows.length - 8} entidades más
                  </p>
                )}
              </div>

              {createError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              {step === 'creating' && (
                <div className="flex items-center justify-center gap-2 text-green-600 py-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">Creando {rows.length} entidades…</span>
                </div>
              )}
            </>
          )}

          {/* ── Step: Results ────────────────────────────────────────────── */}
          {step === 'results' && results && (
            <div className="space-y-4 text-center py-4">
              {results.created > 0 ? (
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              ) : (
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
              )}

              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {results.created} entidad{results.created !== 1 ? 'es' : ''} creada{results.created !== 1 ? 's' : ''}
                </p>
                {results.errors.length > 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    {results.errors.length} error{results.errors.length !== 1 ? 'es' : ''}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <MapPin className="w-4 h-4 text-green-500" />
                Tipo: <span className="font-mono font-medium">{entityType}</span>
              </div>

              {results.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 text-left max-h-32 overflow-y-auto">
                  {results.errors.map((e: any, i: number) => (
                    <p key={i}>• {typeof e === 'string' ? e : JSON.stringify(e)}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={step === 'results' ? handleClose : handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
          >
            {step === 'results' ? 'Cerrar' : 'Cancelar'}
          </button>

          <div className="flex gap-2">
            {step === 'preview' && (
              <button
                onClick={() => setStep('upload')}
                className="flex items-center gap-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Atrás
              </button>
            )}

            {step === 'preview' && (
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Crear {rows.length} entidades
              </button>
            )}

            {step === 'results' && results && results.created > 0 && (
              <button
                onClick={() => { reset(); }}
                className="px-4 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
              >
                Importar otro fichero
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
