// =============================================================================
// Parcel Confirmation Modal - Confirm and name selected parcel
// =============================================================================

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Ruler } from 'lucide-react';
import type { GeoPolygon } from '@/types';
import { calculatePolygonAreaHectares } from '@/utils/geo';
import { useI18n } from '@/context/I18nContext';

interface ParcelConfirmationModalProps {
  isOpen: boolean;
  geometry: GeoPolygon | null;
  cadastralReference?: string;
  municipality?: string;
  province?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export const ParcelConfirmationModal: React.FC<ParcelConfirmationModalProps> = ({
  isOpen,
  geometry,
  cadastralReference,
  municipality,
  province,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const [parcelName, setParcelName] = useState('');
  const [areaHectares, setAreaHectares] = useState<number | null>(null);

  useEffect(() => {
    if (geometry) {
      const area = calculatePolygonAreaHectares(geometry);
      setAreaHectares(area);
    }
  }, [geometry]);

  useEffect(() => {
    // Generar nombre por defecto
    if (cadastralReference) {
      setParcelName(cadastralReference);
    } else if (municipality && province) {
      setParcelName(`${municipality} - ${province}`);
    } else {
      setParcelName(t('parcels.unnamed_parcel'));
    }
  }, [cadastralReference, municipality, province, t]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (parcelName.trim()) {
      onConfirm(parcelName.trim());
      setParcelName('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            {t('parcels.confirm_parcel_title')}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {cadastralReference && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{t('parcels.cadastral_reference')}</p>
              <p className="text-sm font-medium text-gray-900">{cadastralReference}</p>
            </div>
          )}

          {(municipality || province) && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{t('parcels.location')}</p>
              <p className="text-sm font-medium text-gray-900">
                {municipality && province ? `${municipality}, ${province}` : municipality || province}
              </p>
            </div>
          )}

          {areaHectares !== null && (
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <p className="text-xs text-emerald-700 mb-1 flex items-center gap-1">
                <Ruler className="w-3 h-3" />
                {t('parcels.area')}
              </p>
              <p className="text-lg font-bold text-emerald-900">
                {areaHectares.toFixed(2)} {t('ndvi.hectares')}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('parcels.parcel_name')} <span className="text-red-500">{t('parcels.parcel_name_required')}</span>
            </label>
            <input
              type="text"
              value={parcelName}
              onChange={(e) => setParcelName(e.target.value)}
              placeholder={t('parcels.parcel_name_placeholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('parcels.parcel_name_help')}
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('parcels.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!parcelName.trim()}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {t('parcels.add_parcel')}
          </button>
        </div>
      </div>
    </div>
  );
};

