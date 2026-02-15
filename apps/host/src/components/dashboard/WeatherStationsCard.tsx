import React from 'react';
import { Cloud, Plus } from 'lucide-react';
import type { WeatherStation } from '@/types';

interface WeatherStationsCardProps {
  weatherStations: WeatherStation[];
  canManageDevices: boolean;
  onOpenWizard: (entityType: string) => void;
}

export const WeatherStationsCard: React.FC<WeatherStationsCardProps> = ({ weatherStations, canManageDevices, onOpenWizard }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Cloud className="w-6 h-6" />
          Estaciones Meteorológicas
        </h2>
      </div>

      <div className="p-6">
        {weatherStations.length === 0 ? (
          <div className="text-center py-12">
            <Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No hay estaciones registradas</p>
            {canManageDevices && (
              <button
                onClick={() => onOpenWizard('WeatherObserved')}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Añadir Estación
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {weatherStations.slice(0, 4).map((station) => (
              <div key={station.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {station.name?.value || station.id}
                    </h4>
                    {station.temperature && (
                      <p className="text-sm text-gray-500">
                        {station.temperature.value}°C
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
