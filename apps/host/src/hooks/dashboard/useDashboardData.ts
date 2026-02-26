import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import api from '@/services/api';
import { logger } from '@/utils/logger';
import type { Robot, Sensor, Parcel, TenantUsageSummary, AgriculturalMachine, LivestockAnimal, WeatherStation } from '@/types';

export interface ExpirationInfo {
  days_remaining: number | null;
  expires_at: string | null;
  plan: string | null;
}

export interface DashboardData {
  robots: Robot[];
  sensors: Sensor[];
  parcels: Parcel[];
  machines: AgriculturalMachine[];
  livestock: LivestockAnimal[];
  weatherStations: WeatherStation[];
  isLoading: boolean;
  expirationInfo: ExpirationInfo | null;
  tenantUsage: TenantUsageSummary | null;
  loadData: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const { user, getToken } = useAuth();

  const [robots, setRobots] = useState<Robot[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [machines, setMachines] = useState<AgriculturalMachine[]>([]);
  const [livestock, setLivestock] = useState<LivestockAnimal[]>([]);
  const [weatherStations, setWeatherStations] = useState<WeatherStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expirationInfo, setExpirationInfo] = useState<ExpirationInfo | null>(null);
  const [tenantUsage, setTenantUsage] = useState<TenantUsageSummary | null>(null);

  const loadExpirationInfo = useCallback(async (): Promise<ExpirationInfo | null> => {
    try {
      const token = getToken() || sessionStorage.getItem('auth_token') || '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await api.get('/admin/tenants', {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let tenants: any[] = [];
      if (Array.isArray(response.data)) {
        tenants = response.data;
      } else if (response.data?.tenants && Array.isArray(response.data.tenants)) {
        tenants = response.data.tenants;
      } else if (response.data && typeof response.data === 'object') {
        tenants = [response.data];
      }

      const currentTenant = tenants.find((t: any) =>
        t.tenant === user?.tenant || t.email === user?.email || t.tenant_id === user?.tenant
      );

      if (currentTenant && currentTenant.days_remaining !== null && currentTenant.days_remaining !== undefined) {
        return {
          days_remaining: Math.floor(currentTenant.days_remaining),
          expires_at: currentTenant.expires_at,
          plan: currentTenant.plan || 'basic'
        };
      }

      return null;
    } catch (error) {
      logger.error('Error loading expiration info', error);
      return null;
    }
  }, [user, getToken]);

  const loadData = useCallback(async () => {
    logger.debug('[Dashboard] Starting loadData');
    setIsLoading(true);
    const startTime = Date.now();

    try {
      const withTimeout = <T,>(promise: Promise<T>, timeout: number, name: string): Promise<T> => {
        return Promise.race([
          promise.then(result => {
            logger.debug(`[Dashboard] ${name} loaded in ${Date.now() - startTime}ms`);
            return result;
          }),
          new Promise<T>((_, reject) =>
            setTimeout(() => {
              logger.warn(`[Dashboard] ${name} timed out after ${timeout}ms`);
              reject(new Error(`${name} timeout`));
            }, timeout)
          )
        ]);
      };

      logger.debug('[Dashboard] Starting parallel data loads');
      const results = await Promise.allSettled([
        withTimeout(
          api.getRobots().catch(err => {
            logger.warn('[Dashboard] Error loading robots:', err);
            return [];
          }),
          8000,
          'Robots'
        ),
        withTimeout(
          api.getSensors().catch(err => {
            logger.warn('[Dashboard] Error loading sensors:', err);
            return [];
          }),
          8000,
          'Sensors'
        ),
        withTimeout(
          api.getParcels().catch(err => {
            logger.warn('[Dashboard] Error loading parcels:', err);
            return [];
          }),
          8000,
          'Parcels'
        ),
        withTimeout(
          api.getMachines().catch(err => {
            logger.warn('[Dashboard] Error loading machines:', err);
            return [];
          }),
          8000,
          'Machines'
        ),
        withTimeout(
          api.getLivestock().catch(err => {
            logger.warn('[Dashboard] Error loading livestock:', err);
            return [];
          }),
          8000,
          'Livestock'
        ),
        withTimeout(
          api.getWeatherStations().catch(err => {
            logger.warn('[Dashboard] Error loading weather stations:', err);
            return [];
          }),
          8000,
          'WeatherStations'
        ),
        withTimeout(
          loadExpirationInfo().catch(err => {
            logger.warn('[Dashboard] Error loading expiration info:', err);
            return null;
          }),
          12000,
          'ExpirationInfo'
        ),
        withTimeout(
          api.getTenantUsage().catch(err => {
            logger.warn('[Dashboard] Error loading tenant usage:', err);
            return null;
          }),
          8000,
          'TenantUsage'
        ),
      ]);

      const totalTime = Date.now() - startTime;
      logger.debug(`[Dashboard] All data loads completed in ${totalTime}ms`);

      const robotsData = results[0].status === 'fulfilled' ? results[0].value : [];
      const sensorsData = results[1].status === 'fulfilled' ? results[1].value : [];
      const parcelsData = results[2].status === 'fulfilled' ? results[2].value : [];
      const machinesData = results[3].status === 'fulfilled' ? results[3].value : [];
      const livestockData = results[4].status === 'fulfilled' ? results[4].value : [];
      const weatherStationsData = results[5].status === 'fulfilled' ? results[5].value : [];
      const expirationData = results[6].status === 'fulfilled' ? results[6].value : null;
      const usageData = results[7].status === 'fulfilled' ? results[7].value : null;

      setRobots(Array.isArray(robotsData) ? robotsData : []);
      setSensors(Array.isArray(sensorsData) ? sensorsData : []);
      setParcels(Array.isArray(parcelsData) ? parcelsData : []);
      setMachines(Array.isArray(machinesData) ? machinesData : []);
      setLivestock(Array.isArray(livestockData) ? livestockData : []);
      setWeatherStations(Array.isArray(weatherStationsData) ? weatherStationsData : []);
      setExpirationInfo(expirationData);
      setTenantUsage(usageData && usageData.usage ? usageData : null);

      logger.debug('[Dashboard] State updated with results');
    } catch (error) {
      logger.error('[Dashboard] Critical error loading dashboard data:', error);
      setRobots([]);
      setSensors([]);
      setParcels([]);
      setMachines([]);
      setLivestock([]);
      setWeatherStations([]);
      setExpirationInfo(null);
    } finally {
      setIsLoading(false);
      logger.debug('[Dashboard] loadData completed, isLoading set to false');
    }
  }, [loadExpirationInfo]);

  useEffect(() => {
    if (user) {
      logger.debug('[Dashboard] User authenticated, loading data');
      loadData();
      // Poll every 120s (was 30s) to reduce API load: 8 calls × 30/hour → 8 calls × 15/hour
      const interval = setInterval(loadData, 120000);
      return () => clearInterval(interval);
    } else {
      logger.debug('[Dashboard] User not authenticated yet, waiting...');
      setIsLoading(false);
    }
  }, [loadData, user]);

  return {
    robots,
    sensors,
    parcels,
    machines,
    livestock,
    weatherStations,
    isLoading,
    expirationInfo,
    tenantUsage,
    loadData,
  };
}
