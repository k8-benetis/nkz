import React from 'react';
import { MapPin, Plus } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { normalizeParcelValue, normalizeNumberValue } from '@/utils/parcelHelpers';
import type { Parcel } from '@/types';

interface ParcelsOverviewCardProps {
  parcels: Parcel[];
}

export const ParcelsOverviewCard: React.FC<ParcelsOverviewCardProps> = ({ parcels }) => {
  const { t } = useI18n();

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <MapPin className="w-6 h-6" />
          {t('dashboard.registered_parcels')}
        </h2>
      </div>

      <div className="p-6">
        {parcels.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">{t('dashboard.no_parcels')}</p>
            <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition flex items-center gap-2 mx-auto">
              <Plus className="w-4 h-4" />
              {t('dashboard.add_parcel')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {parcels.slice(0, 4).map((parcel) => (
              <div
                key={parcel.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {normalizeParcelValue(parcel.name) || parcel.id}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {normalizeParcelValue(parcel.cropType) || t('dashboard.crop_not_specified')}
                    </p>
                  </div>
                </div>

                {parcel.area && (
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {normalizeNumberValue(parcel.area)} ha
                    </p>
                    <p className="text-xs text-gray-500">{t('dashboard.area_label', { area: '' }).replace(' ha', '')}</p>
                  </div>
                )}
              </div>
            ))}

            {parcels.length > 4 && (
              <button className="w-full py-3 text-yellow-600 hover:bg-yellow-50 rounded-xl transition font-medium">
                {t('common.view_all_parcels')} ({parcels.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
