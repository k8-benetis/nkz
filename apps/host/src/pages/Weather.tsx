// =============================================================================
// Weather Page - Complete Weather and Agronomic Dashboard
// =============================================================================

import React from 'react';
import { WeatherWidget } from '@/components/WeatherWidget';
import { WeatherAgroPanel } from '@/components/WeatherAgroPanel';
import { useI18n } from '@/context/I18nContext';

export const Weather: React.FC = () => {
  const { t } = useI18n();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('weather.page_title')}
        </h1>
        <p className="text-gray-600">
          {t('weather.page_subtitle')}
        </p>
      </div>

      <div className="space-y-6">
        {/* Weather Widget with Forecast */}
        <WeatherWidget />
        
        {/* Agronomic Panel for Tenant */}
        <WeatherAgroPanel />
      </div>
    </>
  );
};

