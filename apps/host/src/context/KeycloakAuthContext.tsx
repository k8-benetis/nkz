// =============================================================================
// Keycloak Auth Context - Lazy initialization
// =============================================================================

import React, { createContext, useContext, useState, ReactNode } from 'react';
import Keycloak from 'keycloak-js';
import { getConfig } from '@/config/environment';
import { formatAuthError } from '@/utils/keycloakHelpers';
import { logger } from '@/utils/logger';
import { api, setKeycloakRef } from '@/services/api';

export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  tenantName?: string;
  tenant?: string;
  roles: string[];
}

export interface TenantProfile {
  tenant_id: string;
  tenant_name: string;
  plan_type: string;
  status: string;
  timezone: string;
  locale: string;
  currency: string;
  default_location: { lat: number; lon: number } | null;
}

export interface KeycloakAuthContextType {
  keycloak: Keycloak | null;
  user: KeycloakUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (forcePrompt?: boolean) => Promise<void>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  getToken: () => string | undefined;
  tenantId: string;
  tenantName: string;
  tenantProfile: TenantProfile | null;
  refreshTenantProfile: () => void;
}

const KeycloakAuthContext = createContext<KeycloakAuthContextType | undefined>(undefined);

interface KeycloakAuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<KeycloakAuthProviderProps> = ({ children }) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Start as loading until we check auth status
  const [isProcessingLogin, setIsProcessingLogin] = useState(false); // Flag to prevent login loops
  const errorProcessedRef = React.useRef<string | null>(null); // Track processed errors to avoid loops

  // formatError is now imported as formatAuthError from @/utils/keycloakHelpers

  // JWT payload shape (Keycloak token body)
  type TokenPayload = {
    realm_access?: { roles?: string[] };
    resource_access?: Record<string, { roles?: string[] }>;
    roles?: string[];
    tenant_id?: string;
    'tenant-id'?: string; // Legacy, remove after 2026-04-02
  };

  const updateUserRolesFromToken = (kc: Keycloak): void => {
    if (!kc.token) return;

    try {
      const decoded = JSON.parse(atob(kc.token.split('.')[1])) as TokenPayload;
      const realmRoles = decoded.realm_access?.roles ?? [];
      const resourceRoles = Object.values(decoded.resource_access ?? {}).flatMap((r: { roles?: string[] }) => r.roles ?? []);
      const rootRoles = decoded.roles || decoded['roles'] || [];
      const roles = [...new Set([...realmRoles, ...resourceRoles, ...rootRoles])];

      // Extract tenant - canonical claim names only
      const tokenTenant = decoded.tenant_id || decoded['tenant-id'] || '';

      logger.debug('[Auth] Updating user roles from token - roles:', roles, 'tenant:', tokenTenant);

      // Update user state using functional update to get current state
      setUser((currentUser: KeycloakUser | null) => {
        if (currentUser) {
          // Update existing user with new roles
          return {
            ...currentUser,
            roles: roles,
            tenant: tokenTenant || currentUser.tenant,
          };
        } else {
          // If no user yet, use token data
          return {
            id: kc.subject || '',
            username: kc.tokenParsed?.preferred_username || '',
            email: kc.tokenParsed?.email || '',
            name: kc.tokenParsed?.name || '',
            tenant: tokenTenant,
            roles: roles,
          };
        }
      });
    } catch (e) {
      logger.warn('[Auth] Error updating roles from token:', e);
    }
  };

  const login = async (forcePrompt: boolean = false) => {
    // CRÍTICO: Detectar error=login_required ANTES de cualquier otra lógica
    // Si hay error, limpiar hash e ir a Keycloak INMEDIATAMENTE (solo una vez para evitar bucles)
    if (typeof window !== 'undefined') {
      const hasError = window.location.hash.includes('error=login_required') ||
        window.location.search.includes('error=login_required');

      if (hasError || forcePrompt) {
        const errorHash = window.location.hash + window.location.search;

        // Verificar si ya procesamos este error (solo si no es forzado)
        if (!forcePrompt && errorProcessedRef.current === errorHash) {
          logger.debug('[Auth] ⏭️ Error ya procesado en login(), evitando bucle');
          return;
        }

        logger.debug('[Auth] 🔴 ERROR=LOGIN_REQUIRED DETECTADO o FORZADO - REDIRIGIENDO A KEYCLOAK INMEDIATAMENTE');

        // Marcar este error como procesado
        if (!forcePrompt) {
          errorProcessedRef.current = errorHash;
        }

        // Limpiar hash INMEDIATAMENTE
        window.history.replaceState({}, document.title, window.location.pathname);

        // CRÍTICO: Cuando forcePrompt=true, crear NUEVA instancia de Keycloak
        // Inicializar SIN onLoad (no usar check-sso) y luego llamar a login() con prompt=login
        // Esto evita que Keycloak use prompt=none de check-sso
        const config = getConfig();

        // Crear NUEVA instancia (no reutilizar la existente que puede tener check-sso configurado)
        const freshKc = new Keycloak({
          url: config.keycloak.url,
          realm: config.keycloak.realm,
          clientId: config.keycloak.clientId,
        });

        // CRÍTICO: Guardar la nueva instancia en el estado ANTES de inicializar
        // Esto asegura que el callback use la misma instancia
        setKeycloak(freshKc);

        // Inicializar SIN onLoad (no check-sso) - esto evita prompt=none
        // Luego llamar a login() con prompt=login explícito
        logger.debug('[Auth] Creando nueva instancia Keycloak, inicializando sin check-sso, luego login() con prompt=login');

        try {
          // Inicializar mínimamente SIN check-sso
          await freshKc.init({
            onLoad: undefined, // Sin onLoad - no hacer check-sso que usa prompt=none
            pkceMethod: 'S256', // PKCE para seguridad
            checkLoginIframe: false,
            enableLogging: true,
          });

          // Ahora llamar a login() con prompt=login explícito
          // Keycloak JS SDK debería respetar el prompt=login en la URL
          logger.debug('[Auth] Llamando a login() con prompt=login');
          await freshKc.login({
            prompt: 'login', // CRÍTICO: Forzar formulario de login
            redirectUri: `${window.location.origin}/dashboard`
          });

          logger.debug('[Auth] kc.login() llamado exitosamente');
        } catch (err) {
          logger.error('[Auth] Error en kc.login(), usando redirección manual como fallback:', err);
          // Fallback: redirección manual si kc.login() falla
          const keycloakUrl = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/auth`;
          const params = new URLSearchParams({
            client_id: config.keycloak.clientId,
            redirect_uri: `${window.location.origin}/dashboard`,
            response_type: 'code',
            response_mode: 'fragment',
            scope: 'openid',
            prompt: 'login' // CRÍTICO: Forzar formulario de login
          });
          logger.debug('[Auth] Redirección manual fallback con prompt=login');
          window.location.href = `${keycloakUrl}?${params.toString()}`;
        }

        return; // SALIR INMEDIATAMENTE - NO procesar más lógica
      }
    }

    // Prevenir bucles: si ya estamos procesando un login, no hacer nada
    if (isProcessingLogin) {
      logger.debug('[Auth] ⏭️ Login already in progress, skipping...');
      return;
    }

    logger.debug('[Auth] login() called');
    setIsProcessingLogin(true);
    const config = getConfig();

    try {
      let kc = keycloak;

      if (!kc) {
        logger.debug('[Auth] Creating new Keycloak instance');
        kc = new Keycloak({
          url: config.keycloak.url,
          realm: config.keycloak.realm,
          clientId: config.keycloak.clientId,
        });
        setKeycloak(kc);
      }

      logger.debug('[Auth] Initializing Keycloak');
      setIsLoading(true);

      // Check if we're in the middle of a callback (hash contains code)
      const hasCode = typeof window !== 'undefined' && (
        window.location.hash.includes('code=') ||
        window.location.search.includes('code=')
      );

      logger.debug('[Auth] Callback check:', {
        hasCode,
        hash: typeof window !== 'undefined' ? window.location.hash.substring(0, 50) : 'N/A'
      });

      // CRÍTICO: Si es una llamada explícita del usuario (no callback, no error previo),
      // NO usar check-sso porque usa prompt=none y devuelve error=login_required.
      // En su lugar, inicializar mínimamente y llamar directamente a login() con prompt=login
      if (!hasCode && !errorProcessedRef.current) {
        logger.debug('[Auth] Usuario hizo clic explícito en Login - inicializando mínimamente y llamando a login() con prompt=login');

        // Inicializar Keycloak mínimamente (sin onLoad para evitar check-sso)
        try {
          await kc.init({
            onLoad: undefined, // Sin onLoad - no hacer check-sso
            pkceMethod: 'S256',
            checkLoginIframe: false,
            enableLogging: true,
          });
        } catch (initError) {
          logger.error('[Auth] Error en init mínimo:', initError);
        }

        setIsLoading(false);
        setIsProcessingLogin(false);

        // Llamar directamente a login() con prompt=login - esto fuerza que Keycloak muestre el formulario
        logger.debug('[Auth] Llamando a kc.login() directamente con prompt=login');
        await kc.login({
          prompt: 'login', // CRÍTICO: Forzar formulario de login
          redirectUri: `${window.location.origin}/dashboard`
        }).catch(err => {
          logger.error('[Auth] Error en kc.login():', err);
          setIsProcessingLogin(false);
        });
        return; // Salir - kc.login() redirige
      }

      // CRÍTICO: Si hay código en el callback, Keycloak DEBE procesarlo durante init()
      // NO usar check-sso para callbacks porque puede interferir
      // Si la instancia ya fue inicializada, puede que necesitemos reinicializarla para procesar el callback
      let authenticated: boolean;

      if (hasCode) {
        logger.debug('[Auth] 🔄 Callback con code detectado - procesando con init()');
        // Para callbacks, NO usar check-sso - dejar que Keycloak procese el callback automáticamente
        authenticated = await kc.init({
          onLoad: undefined, // Sin onLoad - Keycloak procesará el callback automáticamente
          pkceMethod: 'S256',
          checkLoginIframe: false,
          enableLogging: true,
        });

        logger.debug('[Auth] Callback procesado, authenticated:', authenticated, 'hasToken:', !!kc.token);

        // Verificar si el callback fue procesado correctamente
        if (kc.token && authenticated) {
          logger.debug('[Auth] ✅ Callback procesado exitosamente - token encontrado');

          // CRÍTICO: Establecer autenticación y configurar token INMEDIATAMENTE
          setIsAuthenticated(true);
          setIsLoading(false);

          // Guardar token en localStorage
          if (kc.token) {
            api.setSession(kc.token).then(() => setSessionReady(true)).catch(() => setSessionReady(true));
          }

          // Configurar refresh de token
          kc.onTokenExpired = async () => {
            try {
              const refreshed = await kc.updateToken(30);
              if (refreshed && kc.token) {
                api.setSession(kc.token).catch(() => {});
                // CRÍTICO: Actualizar roles cuando el token se refresca
                updateUserRolesFromToken(kc);
              }
            } catch (e) {
              logger.warn('Token refresh failed, forcing login');
              kc.login();
            }
          };

          // Decode token para obtener tenant y roles
          let roles: string[] = [];
          let tokenTenant = '';

          try {
            const decoded = JSON.parse(atob(kc.token.split('.')[1]));
            // Buscar roles en múltiples ubicaciones posibles (Realm + Client roles)
            const realmRoles = decoded.realm_access?.roles || [];
            const resourceRoles = Object.values(decoded.resource_access || {}).flatMap((r: any) => r.roles || []);
            const rootRoles = decoded.roles || decoded['roles'] || [];
            roles = [...new Set([...realmRoles, ...resourceRoles, ...rootRoles])];

            // Buscar tenant_id en canonical claim names
            const rawTenant = decoded.tenant_id || decoded['tenant-id'] || '';

            // Si es array (de Keycloak group mapper), tomar primer elemento
            tokenTenant = Array.isArray(rawTenant) ? (rawTenant[0] || '') : rawTenant;
            logger.debug('[Auth] Token decoded - roles:', roles, 'tenant:', tokenTenant, 'full decoded:', decoded);
          } catch (e) {
            logger.warn('[Auth] Error decoding token:', e);
          }

          // Fallback a tokenParsed
          if (roles.length === 0) {
            roles = kc.tokenParsed?.realm_access?.roles || (kc.tokenParsed as any)?.roles || (kc.tokenParsed as any)?.['roles'] || [];
          }
          if (!tokenTenant) {
            tokenTenant = (kc.tokenParsed as any)?.tenant_id || (kc.tokenParsed as any)?.['tenant-id'] || '';
          }

          if (!tokenTenant) {
            logger.warn('[Auth] tenant_id is empty after token decode. Ensure Keycloak has the tenant_id user attribute mapper configured on the client.');
          }

          // Cargar perfil de usuario
          try {
            const userInfo = await kc.loadUserProfile();
            logger.debug('[Auth] 🔍 [CALLBACK] loadUserProfile() returned:', {
              firstName: userInfo?.firstName,
              lastName: userInfo?.lastName,
              username: userInfo?.username,
              email: userInfo?.email,
              fullObject: userInfo
            });
            logger.debug('[Auth] 🔍 [CALLBACK] tokenParsed:', {
              given_name: kc.tokenParsed?.given_name,
              family_name: kc.tokenParsed?.family_name,
              name: kc.tokenParsed?.name
            });

            const finalFirstName = userInfo?.firstName || kc.tokenParsed?.given_name || '';
            const finalLastName = userInfo?.lastName || kc.tokenParsed?.family_name || '';
            const finalName = `${finalFirstName} ${finalLastName}`.trim();

            logger.debug('[Auth] 🔍 [CALLBACK] Final user name values:', {
              firstName: finalFirstName,
              lastName: finalLastName,
              fullName: finalName
            });

            setUser({
              id: kc.subject || '',
              username: userInfo?.username || kc.tokenParsed?.preferred_username || '',
              email: userInfo?.email || kc.tokenParsed?.email || '',
              firstName: finalFirstName,
              lastName: finalLastName,
              name: finalName,
              tenant: tokenTenant,
              roles: roles,
            });
          } catch (profileError) {
            logger.warn('[Auth] Error loading user profile, using token data:', profileError);
            setUser({
              id: kc.subject || '',
              username: kc.tokenParsed?.preferred_username || '',
              email: kc.tokenParsed?.email || '',
              name: kc.tokenParsed?.name || '',
              tenant: tokenTenant,
              roles: roles,
            });
          }

          // Limpiar hash después de procesar
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              if (window.location.hash) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            }, 100);
          }

          setIsProcessingLogin(false);
          logger.debug('[Auth] ✅ Callback completado - usuario autenticado');

          // SALIR INMEDIATAMENTE - no continuar con más código
          return;
        } else {
          logger.error('[Auth] ❌ Callback NO procesado correctamente');
          logger.error('[Auth] Token:', !!kc.token, 'Authenticated:', authenticated);
          logger.error('[Auth] Hash:', window.location.hash.substring(0, 100));

          // El callback no fue procesado - puede ser un error o PKCE mismatch
          setIsAuthenticated(false);
          setIsLoading(false);
          setIsProcessingLogin(false);

          // Limpiar hash
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          logger.error('[Auth] Error procesando callback');
          // NO llamar a login() aquí porque causaría un bucle - dejar que el usuario intente de nuevo
          return;
        }
      } else {
        // Flujo normal (sin callback) - usar check-sso para verificar sesión existente
        authenticated = await kc.init({
          onLoad: 'check-sso',
          pkceMethod: 'S256',
          checkLoginIframe: false,
          enableLogging: true,
        });

        logger.debug('[Auth] Inicializado sin callback, authenticated:', authenticated, 'hasToken:', !!kc.token);
        setIsAuthenticated(authenticated);
        setIsLoading(false);
      }

      // Clear URL hash/query after processing callback (but wait a bit to ensure it's processed)
      if (hasCode && authenticated && typeof window !== 'undefined') {
        // Wait a moment before clearing to ensure Keycloak has processed everything
        setTimeout(() => {
          if (window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }, 100);
      }

      if (authenticated || kc.token) {
        try {
          // CRÍTICO: Marcar como autenticado SIEMPRE que tengamos un token
          setIsAuthenticated(true);

          if (kc.token) {
            api.setSession(kc.token).then(() => setSessionReady(true)).catch(() => setSessionReady(true));
          }

          kc.onTokenExpired = async () => {
            try {
              const refreshed = await kc.updateToken(30);
              if (refreshed && kc.token) {
                api.setSession(kc.token).catch(() => {});
                // CRÍTICO: Actualizar roles cuando el token se refresca
                updateUserRolesFromToken(kc);
              }
            } catch (e) {
              logger.warn('Token refresh failed, forcing login');
              kc.login();
            }
          };

          // Decode token to get tenant and roles
          let roles: string[] = [];
          let tokenTenant = '';

          if (kc.token) {
            try {
              const decoded = JSON.parse(atob(kc.token.split('.')[1]));
              const realmRoles = decoded.realm_access?.roles || [];
              const resourceRoles = Object.values(decoded.resource_access || {}).flatMap((r: any) => r.roles || []);
              const rootRoles = decoded.roles || decoded['roles'] || [];
              roles = [...new Set([...realmRoles, ...resourceRoles, ...rootRoles])];
              tokenTenant = decoded.tenant_id || decoded['tenant-id'] || '';
              logger.debug('[Auth] Token decoded - roles:', roles, 'tenant:', tokenTenant);
            } catch (e) {
              logger.warn('[Auth] Error decoding token:', e);
            }
          }

          // Fallback to tokenParsed
          if (roles.length === 0) {
            roles = kc.tokenParsed?.realm_access?.roles || (kc.tokenParsed as any)?.roles || [];
          }
          if (!tokenTenant) {
            tokenTenant = (kc.tokenParsed as any)?.tenant_id || (kc.tokenParsed as any)?.['tenant-id'] || '';
          }

          if (!tokenTenant) {
            logger.warn('[Auth] tenant_id is empty after token decode. Ensure Keycloak has the tenant_id user attribute mapper configured on the client.');
          }
          logger.debug('[Auth] Configured roles:', roles);
          logger.debug('[Auth] Configured tenant:', tokenTenant);

          // Load user profile
          let userInfo: any = null;
          try {
            userInfo = await kc.loadUserProfile();
            logger.debug('[Auth] 🔍 loadUserProfile() returned:', {
              firstName: userInfo?.firstName,
              lastName: userInfo?.lastName,
              username: userInfo?.username,
              email: userInfo?.email,
              fullObject: userInfo
            });
          } catch (profileError) {
            logger.warn('Error loading user profile:', formatAuthError(profileError));
            userInfo = {
              username: kc.tokenParsed?.preferred_username || kc.subject || '',
              email: kc.tokenParsed?.email || '',
              firstName: kc.tokenParsed?.given_name || '',
              lastName: kc.tokenParsed?.family_name || '',
            };
          }

          // Debug: Log token parsed data
          logger.debug('[Auth] 🔍 tokenParsed:', {
            given_name: kc.tokenParsed?.given_name,
            family_name: kc.tokenParsed?.family_name,
            name: kc.tokenParsed?.name,
            email: kc.tokenParsed?.email,
            preferred_username: kc.tokenParsed?.preferred_username
          });

          const finalFirstName = userInfo?.firstName || kc.tokenParsed?.given_name || '';
          const finalLastName = userInfo?.lastName || kc.tokenParsed?.family_name || '';
          const finalName = `${finalFirstName} ${finalLastName}`.trim();

          logger.debug('[Auth] 🔍 Final user name values:', {
            firstName: finalFirstName,
            lastName: finalLastName,
            fullName: finalName
          });

          setUser({
            id: kc.subject || '',
            username: userInfo?.username || kc.tokenParsed?.preferred_username || '',
            email: userInfo?.email || kc.tokenParsed?.email || '',
            firstName: finalFirstName,
            lastName: finalLastName,
            name: finalName,
            tenant: tokenTenant,
            roles: roles,
          });

          // Reset flags cuando el login se completa exitosamente
          setIsLoading(false);
          setIsProcessingLogin(false);
          logger.debug('[Auth] ✅ Usuario autenticado y configurado correctamente');
        } catch (error) {
          logger.error('Error setting up user:', formatAuthError(error));
          setIsLoading(false);
          setIsProcessingLogin(false);
        }
      } else {
        // Not authenticated and not in a callback - call login to redirect to Keycloak
        if (!hasCode) {
          logger.debug('[Auth] Not authenticated and not in callback, calling kc.login()');
          setIsProcessingLogin(false); // Reset flag antes de redirigir
          await kc.login({ redirectUri: `${window.location.origin}/dashboard` });
        } else {
          logger.debug('[Auth] In callback but not authenticated, waiting...');
          // Already handled above in the callback processing
          setIsProcessingLogin(false);
        }
      }
    } catch (error) {
      logger.error('Keycloak init/login failed:', formatAuthError(error));
      setIsLoading(false);
      setIsProcessingLogin(false); // Reset flag on error
    }
  };

  const logout = () => {
    if (keycloak) {
      keycloak.logout();
      setKeycloak(null);
      setUser(null);
      setIsAuthenticated(false);
      setSessionReady(false);
      api.clearSession().catch(() => {});
    }
  };

  const hasRole = (role: string): boolean => {
    return user?.roles?.includes(role) || false;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some(role => user?.roles?.includes(role)) || false;
  };

  const getToken = (): string | undefined => {
    return keycloak?.token;
  };

  const tenantId = user?.tenant || 'master';
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const fetchTenantProfile = React.useCallback(() => {
    if (!isAuthenticated || !sessionReady || !user?.tenant) {
      setTenantProfile(null);
      return;
    }
    api.get('/api/tenant/profile')
      .then(res => {
        if (res.data) {
          setTenantProfile(res.data as TenantProfile);
        }
      })
      .catch(() => {
        setTenantProfile(null);
      });
  }, [isAuthenticated, sessionReady, user?.tenant]);

  React.useEffect(() => {
    fetchTenantProfile();
  }, [fetchTenantProfile]);

  const tenantName = tenantProfile?.tenant_name || user?.tenant || '';

  // Share Keycloak ref with api.ts for token refresh / cookie update.
  // NOT exposed via window — modules cannot access it.
  React.useEffect(() => {
    if (keycloak) {
      setKeycloakRef(keycloak as any);
    } else {
      setKeycloakRef(null);
    }
  }, [keycloak]);

  // CRÍTICO: Detectar callback o error INMEDIATAMENTE al montar y procesarlo
  React.useEffect(() => {
    logger.debug('[Auth] 🔄 AuthProvider mounted');

    if (typeof window !== 'undefined') {
      // Detectar callback con código OAuth
      const hasCallback = window.location.hash.includes('code=') ||
        window.location.search.includes('code=');

      // Detectar error de login
      const hasError = window.location.hash.includes('error=login_required') ||
        window.location.search.includes('error=login_required');

      // Si hay callback, procesarlo automáticamente
      // PERO solo si no estamos ya procesando un login (evitar bucles)
      if (hasCallback && !isProcessingLogin) {
        logger.debug('[Auth] ✅ Callback con code= detectado - procesando automáticamente');
        setIsLoading(true);
        setIsProcessingLogin(true);
        // Llamar a login() para procesar el callback - esto inicializará Keycloak y procesará el código
        login().catch(err => {
          logger.error('[Auth] Error procesando callback:', err);
          setIsLoading(false);
          setIsProcessingLogin(false);
        });
        return; // Salir - login() se encargará del resto
      } else if (hasCallback && isProcessingLogin) {
        logger.debug('[Auth] ⏭️ Callback detectado pero ya procesando login, esperando...');
        setIsLoading(true);
        return; // Esperar a que termine el procesamiento actual
      }

      // Si hay error, manejar el error (solo una vez para evitar bucles)
      // PERO: si estamos en una ruta pública (/, /login, /activate, /forgot-password), 
      // NO procesar el error automáticamente - dejar que el usuario haga clic en Login
      if (hasError) {
        const errorHash = window.location.hash + window.location.search;
        const isPublicRoute = ['/', '/login', '/activate', '/forgot-password'].includes(window.location.pathname);

        // Verificar si ya procesamos este error
        if (errorProcessedRef.current === errorHash) {
          logger.debug('[Auth] ⏭️ Error ya procesado, evitando bucle');
          setIsLoading(false);
          return;
        }

        // Si estamos en una ruta pública, solo limpiar el error y marcar como procesado
        // NO redirigir automáticamente - dejar que el usuario haga clic en Login
        if (isPublicRoute) {
          logger.debug('[Auth] ⚠️ Error detectado en ruta pública - limpiando pero no redirigiendo automáticamente');
          errorProcessedRef.current = errorHash;
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsLoading(false);
          return; // Salir - no procesar más
        }

        logger.debug('[Auth] 🔴 ERROR=LOGIN_REQUIRED detectado - redirigiendo a login (evitar bucle)');

        errorProcessedRef.current = errorHash;
        window.history.replaceState({}, document.title, window.location.pathname);

        // Redirect to login with session_expired flag instead of calling kc.login() again
        // (avoids loop when Keycloak returns login_required again)
        const loginPath = '/login';
        const params = new URLSearchParams(window.location.search);
        params.set('session_expired', '1');
        window.location.replace(`${window.location.origin}${loginPath}?${params.toString()}`);
        setIsLoading(false);
        return;
      }
    }

    // CRÍTICO: En rutas públicas, NO inicializar Keycloak automáticamente
    // Esto evita navegación automática con prompt=none
    const isPublicRoute = typeof window !== 'undefined' &&
      ['/', '/login', '/activate', '/forgot-password'].includes(window.location.pathname);

    // CRÍTICO: Si ya estamos autenticados (por ejemplo, después de procesar callback),
    // NO hacer nada más - evitar interferencias
    if (isAuthenticated) {
      logger.debug('[Auth] Ya autenticado, saltando inicialización automática');
      setIsLoading(false);
      return;
    }

    // Si no hay callback ni error, intentar check-sso para restaurar sesión
    // PERO solo si NO estamos en una ruta pública Y no estamos ya procesando un login
    if (!keycloak && !isPublicRoute && !isProcessingLogin) {
      logger.debug('[Auth] Non-public route, inicializando Keycloak con check-sso...');
      setIsLoading(true);
      const config = getConfig();
      const kc = new Keycloak({
        url: config.keycloak.url,
        realm: config.keycloak.realm,
        clientId: config.keycloak.clientId,
      });
      setKeycloak(kc);

      // Intentar inicializar con check-sso (silent check)
      kc.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        enableLogging: true,
      }).then((authenticated) => {
        logger.debug('[Auth] Keycloak inicializado, authenticated:', authenticated, 'token:', !!kc.token);
        if (authenticated && kc.token) {
          setIsAuthenticated(true);
          // Set httpOnly cookie for the restored session
          api.setSession(kc.token).then(() => setSessionReady(true)).catch(() => setSessionReady(true));
          // Configurar usuario y roles desde el token
          try {
            const decoded = JSON.parse(atob(kc.token.split('.')[1]));
            const roles = decoded.realm_access?.roles || decoded.roles || decoded['roles'] || [];
            const tokenTenant = decoded.tenant_id || decoded['tenant-id'] || '';
            logger.debug('[Auth] Init - Token decoded - roles:', roles, 'tenant:', tokenTenant);

            kc.loadUserProfile().then((userInfo) => {
              setUser({
                id: kc.subject || '',
                username: userInfo?.username || kc.tokenParsed?.preferred_username || '',
                email: userInfo?.email || kc.tokenParsed?.email || '',
                firstName: userInfo?.firstName || kc.tokenParsed?.given_name || '',
                lastName: userInfo?.lastName || kc.tokenParsed?.family_name || '',
                name: `${userInfo?.firstName || kc.tokenParsed?.given_name || ''} ${userInfo?.lastName || kc.tokenParsed?.family_name || ''}`.trim(),
                tenant: tokenTenant,
                roles: roles,
              });
              setIsLoading(false);
            }).catch(() => {
              // Fallback si loadUserProfile falla
              setUser({
                id: kc.subject || '',
                username: kc.tokenParsed?.preferred_username || '',
                email: kc.tokenParsed?.email || '',
                firstName: kc.tokenParsed?.given_name || '',
                lastName: kc.tokenParsed?.family_name || '',
                name: `${kc.tokenParsed?.given_name || ''} ${kc.tokenParsed?.family_name || ''}`.trim(),
                tenant: tokenTenant,
                roles: roles,
              });
              setIsLoading(false);
            });
          } catch (e) {
            logger.error('[Auth] Error decodificando token:', e);
            setIsLoading(false);
          }
        } else {
          // No active session
          logger.debug('[Auth] No active Keycloak session');
          api.clearSession().catch(() => {});
          setIsAuthenticated(false);
          setIsLoading(false);
        }
      }).catch((err) => {
        logger.error('[Auth] Error inicializando Keycloak:', err);
        setIsLoading(false);
      });
    } else if (isPublicRoute) {
      // En rutas públicas, NO inicializar Keycloak automáticamente
      // El usuario debe hacer clic explícitamente en Login
      logger.debug('[Auth] Ruta pública detectada - NO inicializando Keycloak automáticamente');
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo ejecutar una vez al montar

  const value: KeycloakAuthContextType = {
    keycloak,
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    hasRole,
    hasAnyRole,
    getToken,
    tenantId,
    tenantName,
    tenantProfile,
    refreshTenantProfile: fetchTenantProfile,
  };

  // Expose auth context to external modules via window (for SDK access)
  // SECURITY: token and getToken are intentionally omitted — modules must
  // rely on the httpOnly cookie sent automatically with credentials: 'include'.
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__nekazariAuthContext = {
        isAuthenticated,
        user,
        tenantId,
        tenantName,
        tenantProfile,
        roles: user?.roles ?? [],
        login,
        logout,
        hasRole,
        hasAnyRole,
      };
      logger.debug('[AuthProvider] Auth context exposed to window.__nekazariAuthContext (no token)');
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__nekazariAuthContext;
      }
    };
  }, [isAuthenticated, user, tenantId, tenantName, tenantProfile, login, logout, hasRole, hasAnyRole]);

  return (
    <KeycloakAuthContext.Provider value={value}>
      {children}
    </KeycloakAuthContext.Provider>
  );
};

export const useAuth = (): KeycloakAuthContextType => {
  const context = useContext(KeycloakAuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a KeycloakAuthProvider');
  }
  return context;
};

export const useHasRole = (role: string): boolean => {
  const { hasRole } = useAuth();
  return hasRole(role);
};

export const useTenantId = (): string => {
  const { tenantId } = useAuth();
  return tenantId;
};