/**
 * Copyright 2025 NKZ Platform (Nekazari)
 * Licensed under Apache-2.0
 */

import { useMemo, useContext } from 'react';

export interface AuthSession {
  token?: string;
  tenantId?: string;
  roles: string[];
  email?: string;
  username?: string;
}

export interface AuthApi {
  getToken: () => string | undefined;
  getTenantId: () => string | undefined;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  // Additional properties for compatibility with template expectations
  isAuthenticated: boolean;
  user: {
    id?: string;
    username?: string;
    email?: string;
    roles: string[];
    tenant?: string;
  } | null;
}

/**
 * Hook que expone la interfaz de autenticación del host.
 * 
 * Para módulos externos: Intenta acceder al contexto del host a través de window.__nekazariAuthContext
 * Si no está disponible, usa la sesión proporcionada o valores por defecto.
 * 
 * El host debe exponer el contexto en window.__nekazariAuthContext para que los módulos externos
 * puedan acceder a él sin acoplamiento directo.
 */
export function useAuth(session?: AuthSession): AuthApi {
  // Try to get auth context from host via window global
  // The host should expose its KeycloakAuthContext here
  let hostAuthContext: any = null;
  
  if (typeof window !== 'undefined') {
    try {
      hostAuthContext = (window as any).__nekazariAuthContext;
      if (hostAuthContext) {
        console.log('[SDK useAuth] ✅ Host auth context available');
      } else {
        console.warn('[SDK useAuth] ⚠️ Host auth context not available in window.__nekazariAuthContext');
      }
    } catch (error) {
      console.warn('[SDK useAuth] Could not access host auth context:', error);
    }
  }

  // Use host context if available, otherwise use provided session or defaults
  const resolved = hostAuthContext ? {
    token: hostAuthContext.getToken?.() || hostAuthContext.token || undefined,
    tenantId: hostAuthContext.tenantId || hostAuthContext.getTenantId?.() || undefined,
    roles: hostAuthContext.user?.roles || hostAuthContext.roles || [],
    email: hostAuthContext.user?.email,
    username: hostAuthContext.user?.username,
  } : (session ?? {
    token: undefined,
    tenantId: undefined,
    roles: [],
    email: undefined,
    username: undefined
  });

  // Determine if authenticated based on token presence
  const isAuthenticated = !!resolved.token;
  
  // Build user object
  const user = isAuthenticated ? {
    id: hostAuthContext?.user?.id || hostAuthContext?.keycloak?.subject || undefined,
    username: resolved.username || hostAuthContext?.user?.username || undefined,
    email: resolved.email || hostAuthContext?.user?.email || undefined,
    roles: Array.isArray(resolved.roles) ? resolved.roles : [],
    tenant: resolved.tenantId || hostAuthContext?.user?.tenant || undefined,
  } : null;

  return useMemo<AuthApi>(() => ({
    getToken: () => resolved.token,
    getTenantId: () => resolved.tenantId,
    hasRole: (role: string) => Array.isArray(resolved.roles) && resolved.roles.includes(role),
    hasAnyRole: (roles: string[]) => Array.isArray(resolved.roles) && roles.some(r => resolved.roles.includes(r)),
    isAuthenticated,
    user,
  }), [resolved.token, resolved.tenantId, resolved.roles, resolved.email, resolved.username, isAuthenticated, user]);
}

