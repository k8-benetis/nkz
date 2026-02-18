import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { Lock } from 'lucide-react';
import { logger } from '@/utils/logger';

const KeycloakLogin: React.FC = () => {
  logger.debug('[KeycloakLogin] Component mounted/re-rendered');
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Redirigiendo a Keycloak…');
  const loginInitiatedRef = React.useRef(false); // Track if we've already initiated login

  useEffect(() => {
    logger.debug('[KeycloakLogin] useEffect executing');
    
    // Si ya está autenticado, ir al dashboard
    if (isAuthenticated) {
      logger.debug('[KeycloakLogin] Already authenticated, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    // NO procesar errores aquí - AuthProvider ya lo hace
    // Solo mostrar estado si hay un callback o error
    if (typeof window !== 'undefined') {
      const hasError = window.location.hash.includes('error=login_required') || 
                       window.location.search.includes('error=login_required');
      const hasCode = window.location.hash.includes('code=') ||
                     window.location.search.includes('code=');

      if (hasError) {
        logger.debug('[KeycloakLogin] Error detectado - AuthProvider lo manejará');
        setStatus('Error de autenticación. Redirigiendo...');
        return; // Dejar que AuthProvider maneje el error
      }

      if (hasCode) {
        logger.debug('[KeycloakLogin] Callback detected, waiting for AuthProvider to process...');
        setStatus('Procesando respuesta de Keycloak…');
        return;
      }
    }

    // Si ya iniciamos el login, no hacer nada más
    if (loginInitiatedRef.current) {
      logger.debug('[KeycloakLogin] Login already initiated, waiting...');
      return;
    }

    // Si no hay callback ni error, simplemente iniciar login - REDIRIGIR A KEYCLOAK
    logger.debug('[KeycloakLogin] No callback, starting login - redirecting to Keycloak');
    loginInitiatedRef.current = true;
    setStatus('Redirigiendo a Keycloak…');
    login().catch(err => {
      logger.error('[KeycloakLogin] Login error', err);
      setStatus('Error al iniciar sesión. Usa el botón para reintentar.');
      loginInitiatedRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
      <div className="bg-white rounded-xl shadow-xl p-8 text-center max-w-lg w-full mx-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
          <Lock className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Conectando con Keycloak…</h1>
        <p className="text-gray-600 mb-6">{status}</p>
        <div className="flex items-center justify-center mb-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={async () => {
              loginInitiatedRef.current = false; // Reset flag para permitir reintentar
              setStatus('Reintentando inicio de sesión…');
              try {
                await login();
              } catch (e) {
                logger.error('Login error', e);
                setStatus('Error al iniciar sesión. Intenta nuevamente.');
              }
            }}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
          >
            Reintentar inicio de sesión
          </button>
          <Link
            to="/forgot-password"
            className="text-sm text-gray-600 hover:text-gray-900 transition underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>
    </div>
  );
};

export default KeycloakLogin;
