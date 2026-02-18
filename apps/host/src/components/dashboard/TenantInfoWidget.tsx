import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { Clock, Cloud, Sun, CloudRain, Wind } from 'lucide-react';
import api from '@/services/api';

interface WeatherData {
    temp: number;
    condition: string;
    humidity: number;
    windSpeed: number;
}

interface ForecastDay {
    date: string;
    dayName: string;
    tempMin: number;
    tempMax: number;
    condition: string;
    precipitation: number;
}

export const TenantInfoWidget: React.FC = () => {
    const { user } = useAuth();
    const { t } = useI18n();
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [forecast, _setForecast] = useState<ForecastDay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                // Use correct weather endpoints
                const [observationsResponse] = await Promise.allSettled([
                    api.get('/api/weather/observations/latest')
                ]);

                if (observationsResponse.status === 'fulfilled' && observationsResponse.value.data) {
                    const observations = observationsResponse.value.data.observations || [];
                    if (observations.length > 0) {
                        const latest = observations[0];
                        setWeather({
                            temp: Math.round(latest.temp_avg || latest.temp_max || 20),
                            condition: latest.precip_mm > 0 ? 'rain' : (latest.temp_avg < 15 ? 'cloudy' : 'sunny'),
                            humidity: Math.round(latest.humidity_avg || 50),
                            windSpeed: Math.round((latest.wind_speed_ms || 0) * 3.6) // Convert m/s to km/h
                        });
                    }
                }
            } catch (error) {
                // Silently handle errors - weather is optional
                console.debug('Weather data not available:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
    }, []);

    const getWeatherIcon = (condition: string, size: string = "w-8 h-8") => {
        switch (condition.toLowerCase()) {
            case 'rain': return <CloudRain className={`${size} text-blue-500`} />;
            case 'cloudy': return <Cloud className={`${size} text-gray-500`} />;
            default: return <Sun className={`${size} text-yellow-500`} />;
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                {/* User Info */}
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        👋 {t('dashboard.welcome', { name: user?.name || 'User' })}
                    </h1>
                    <div className="flex items-center gap-4 text-gray-600 dark:text-gray-300">
                        <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                            {user?.tenant || 'Nekazari Tenant'}
                        </span>
                        <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                            {user?.roles?.[0] || 'User'}
                        </span>
                    </div>
                </div>

                {/* Time & Weather */}
                <div className="flex items-center gap-8">
                    {/* Time */}
                    <div className="text-right hidden md:block">
                        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 font-mono">
                            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 flex items-center justify-end gap-1">
                            <Clock className="w-4 h-4" />
                            {time.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                    </div>

                    {/* Weather Divider */}
                    <div className="h-12 w-px bg-gray-200 dark:bg-gray-700 hidden md:block"></div>

                    {/* Weather */}
                    <div className="min-w-[140px]">
                        {loading ? (
                            <div className="animate-pulse flex gap-3">
                                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                                <div className="space-y-2">
                                    <div className="w-16 h-4 bg-gray-200 rounded"></div>
                                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                                </div>
                            </div>
                        ) : weather ? (
                            <div className="flex items-center gap-3">
                                {getWeatherIcon(weather.condition)}
                                <div>
                                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        {weather.temp}°C
                                    </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                        <span className="flex items-center gap-1">
                                            <Wind className="w-3 h-3" /> {weather.windSpeed} km/h
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                                {t('dashboard.configure_parcel_weather')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Forecast Section */}
            {!loading && forecast.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">Previsión 5 días</h3>
                    <div className="grid grid-cols-5 gap-4">
                        {forecast.map((day) => (
                            <div key={day.date} className="text-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                <p className="text-xs text-gray-500 mb-2 capitalize">{day.dayName}</p>
                                <div className="flex justify-center mb-2">
                                    {getWeatherIcon(day.condition, "w-6 h-6")}
                                </div>
                                <p className="text-sm font-medium text-gray-900">
                                    {Math.round(day.tempMax)}° <span className="text-gray-400 text-xs">/ {Math.round(day.tempMin)}°</span>
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
