// =============================================================================
// Cadastral API Service
// =============================================================================
// Service for interacting with Cadastral API

import axios, { AxiosInstance } from 'axios';
import { getConfig } from '@/config/environment';

const config = getConfig();
const API_BASE_URL = config.api.baseUrl;

class CadastralApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((requestConfig) => {
      const token = sessionStorage.getItem('auth_token') || 
                    (window as any).__keycloak?.token || 
                    '';
      if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
      }
      return requestConfig;
    });
  }

  async getParcels(): Promise<any[]> {
    const response = await this.client.get('/api/cadastral-api/parcels');
    return response.data.parcels || [];
  }

  async getParcel(parcelId: string): Promise<any> {
    const response = await this.client.get(`/api/cadastral-api/parcels/${parcelId}`);
    return response.data;
  }

  async createParcel(parcel: {
    cadastral_reference?: string;
    municipality: string;
    province: string;
    crop_type: string;
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    notes?: string;
  }): Promise<any> {
    const response = await this.client.post('/api/cadastral-api/parcels', parcel);
    return response.data;
  }

  async updateParcel(parcelId: string, updates: any): Promise<any> {
    const response = await this.client.put(`/api/cadastral-api/parcels/${parcelId}`, updates);
    return response.data;
  }

  async deleteParcel(parcelId: string): Promise<void> {
    await this.client.delete(`/api/cadastral-api/parcels/${parcelId}`);
  }

  async getSummary(): Promise<any> {
    const response = await this.client.get('/api/cadastral-api/parcels/summary');
    return response.data;
  }

  async requestNDVI(parcelId: string, date?: string): Promise<any> {
    const response = await this.client.post(`/api/cadastral-api/parcels/${parcelId}/request-ndvi`, {
      date: date || new Date().toISOString(),
    });
    return response.data;
  }

  /**
   * Query cadastral parcel by coordinates (reverse geocoding)
   * 
   * @param longitude Longitude in decimal degrees (WGS84)
   * @param latitude Latitude in decimal degrees (WGS84)
   * @param srs Optional spatial reference system (default: '4326' for WGS84)
   * @returns Cadastral data if found, or throws error if not found/not implemented
   */
  async queryByCoordinates(
    longitude: number,
    latitude: number,
    srs: string = '4326'
  ): Promise<{
    cadastralReference: string;
    municipality: string;
    province: string;
    address: string;
    coordinates: { lon: number; lat: number };
    region: 'spain' | 'navarra' | 'euskadi';
    geometry?: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }> {
    const response = await this.client.post('/api/cadastral-api/parcels/query-by-coordinates', {
      longitude,
      latitude,
      srs,
    });
    return response.data;
  }
}

export const cadastralApi = new CadastralApiService();
export default cadastralApi;

