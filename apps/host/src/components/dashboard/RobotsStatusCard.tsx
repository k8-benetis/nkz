import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Battery, Plus } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import type { Robot } from '@/types';

interface RobotsStatusCardProps {
  robots: Robot[];
  isLoading: boolean;
  canManageDevices: boolean;
}

export const RobotsStatusCard: React.FC<RobotsStatusCardProps> = ({ robots, isLoading, canManageDevices }) => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot className="w-6 h-6" />
          {t('dashboard.robot_fleet')}
        </h2>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : robots.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">{t('dashboard.no_robots')}</p>
            {canManageDevices && (
              <button
                onClick={() => navigate('/robots')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                {t('dashboard.add_robot')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {robots.slice(0, 5).map((robot) => (
              <div
                key={robot.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${robot.status?.value === 'working' ? 'bg-green-100 text-green-600' :
                    robot.status?.value === 'charging' ? 'bg-yellow-100 text-yellow-600' :
                      robot.status?.value === 'error' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-600'
                    }`}>
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {robot.name?.value || robot.id}
                    </h4>
                    <p className="text-sm text-gray-500 capitalize">
                      {robot.status?.value ? t(`robots.${robot.status.value}`) : t('dashboard.unknown')}
                    </p>
                  </div>
                </div>

                {robot.batteryLevel && (
                  <div className="flex items-center gap-2">
                    <Battery className={`w-5 h-5 ${robot.batteryLevel.value > 50 ? 'text-green-600' :
                      robot.batteryLevel.value > 20 ? 'text-yellow-600' :
                        'text-red-600'
                      }`} />
                    <span className="font-semibold text-gray-900">
                      {robot.batteryLevel.value}%
                    </span>
                  </div>
                )}
              </div>
            ))}

            {robots.length > 5 && (
              <button className="w-full py-3 text-blue-600 hover:bg-blue-50 rounded-xl transition font-medium">
                {t('common.view_all')} ({robots.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
