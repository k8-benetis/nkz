// =============================================================================
// Cesium Map Placeholder Component
// =============================================================================

import React from 'react';
import { Globe, Maximize2 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface CesiumMapPlaceholderProps {
  title?: string;
  height?: string;
  showControls?: boolean;
}

export const CesiumMapPlaceholder: React.FC<CesiumMapPlaceholderProps> = ({
  title,
  height = 'h-96',
  showControls = true
}) => {
  const { t } = useI18n();
  const displayTitle = title || t('common.map_3d');
  return (
    <div className={`bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border-2 border-dashed border-blue-300 ${height} relative overflow-hidden`}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />
      </div>

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-blue-500 bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Globe className="w-10 h-10 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-blue-900 mb-2">{displayTitle}</h3>
          <p className="text-blue-700 max-w-md">
            {t('common.interactive_3d_visualization')}
          </p>
        </div>

        <div className="space-y-2 text-sm text-blue-800">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>{t('common.terrain_3d')}</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>{t('common.robot_position_realtime')}</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>{t('common.sensor_location')}</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span>{t('common.parcel_delimitation')}</span>
          </div>
        </div>

        {showControls && (
          <div className="mt-6 flex gap-2">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm">
              <Maximize2 className="w-4 h-4" />
              {t('common.full_view')}
            </button>
          </div>
        )}

        {/* Coming Soon Badge */}
        <div className="absolute top-4 right-4">
          <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full shadow-lg">
            {t('common.coming_soon')}
          </span>
        </div>
      </div>
    </div>
  );
};

