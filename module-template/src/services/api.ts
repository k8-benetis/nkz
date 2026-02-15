/**
 * API Client for MODULE_DISPLAY_NAME
 * 
 * This is a template for creating an API client that uses the Nekazari SDK.
 * Replace with your actual API endpoints and methods.
 */

import { NKZClient, useAuth } from '@nekazari/sdk';

/**
 * Hook to get API client instance
 * Automatically handles authentication and tenant context
 */
export function useModuleApi() {
  const { getToken, tenantId } = useAuth();
  
  const client = new NKZClient({
    baseUrl: '/api/MODULE_NAME',
    getToken,
    getTenantId: () => tenantId,
  });

  return {
    // Example API methods - replace with your actual endpoints
    getData: () => client.get('/data'),
    getDataById: (id: string) => client.get(`/data/${id}`),
    createData: (data: any) => client.post('/data', data),
    updateData: (id: string, data: any) => client.put(`/data/${id}`, data),
    deleteData: (id: string) => client.delete(`/data/${id}`),
  };
}

/**
 * Standalone API client (for use outside React components)
 */
export function createModuleApiClient() {
  // This would need token and tenantId passed in
  // For React components, use useModuleApi() instead
  throw new Error('Use useModuleApi() hook in React components');
}

