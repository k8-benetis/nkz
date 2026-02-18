// =============================================================================
// Keycloak Authentication Service
// =============================================================================

import { getConfig } from '@/config/environment';

const config = getConfig();

const keycloakConfig = {
  url: config.keycloak.url,
  realm: config.keycloak.realm,
  clientId: config.keycloak.clientId
};

class KeycloakAuthService {
  private keycloak: any = null;
  private initPromise: Promise<boolean> | null = null;

  async init(): Promise<boolean> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      (async () => {
      try {
        const Keycloak = (await import('keycloak-js')).default;
        this.keycloak = new Keycloak(keycloakConfig);

        const authenticated = await this.keycloak.init({
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
          pkceMethod: 'S256'
        });

        if (authenticated) {
          console.log('User authenticated with Keycloak');
          // Store token in sessionStorage for API calls
          sessionStorage.setItem('auth_token', this.keycloak.token || '');
          localStorage.setItem('user', JSON.stringify({
            id: this.keycloak.subject,
            email: this.keycloak.tokenParsed?.email,
            name: this.keycloak.tokenParsed?.name,
            tenant: this.keycloak.tokenParsed?.tenant || 'default'
          }));
        }

        resolve(authenticated);
      } catch (error) {
        console.error('Keycloak initialization failed:', error);
        resolve(false);
      }
      })();
    });

    return this.initPromise;
  }

  async login(): Promise<void> {
    if (!this.keycloak) {
      await this.init();
    }
    await this.keycloak?.login();
  }

  async logout(): Promise<void> {
    if (!this.keycloak) {
      await this.init();
    }
    await this.keycloak?.logout();
  }

  async register(): Promise<void> {
    if (!this.keycloak) {
      await this.init();
    }
    await this.keycloak?.register();
  }

  isAuthenticated(): boolean {
    return this.keycloak?.authenticated || false;
  }

  getToken(): string | undefined {
    return this.keycloak?.token;
  }

  getUser(): any {
    if (!this.keycloak?.tokenParsed) return null;
    
    return {
      id: this.keycloak.subject,
      email: this.keycloak.tokenParsed.email,
      name: this.keycloak.tokenParsed.name,
      tenant: this.keycloak.tokenParsed.tenant || 'default',
      roles: this.keycloak.tokenParsed.realm_access?.roles || []
    };
  }

  async refreshToken(): Promise<boolean> {
    if (!this.keycloak) return false;
    
    try {
      const refreshed = await this.keycloak.updateToken(30);
      if (refreshed) {
        sessionStorage.setItem('auth_token', this.keycloak.token || '');
      }
      return refreshed;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  hasRole(role: string): boolean {
    return this.keycloak?.hasRealmRole(role) || false;
  }

  isAdmin(): boolean {
    return this.hasRole('admin') || this.hasRole('platform-admin');
  }
}

export const keycloakAuth = new KeycloakAuthService();
export default keycloakAuth;
