// =============================================================================
// Main App Component - Modular Architecture
// =============================================================================
// This file should ONLY contain CORE routes that are essential for the platform.
// All feature modules (NDVI, Weather, Robots, etc.) should be loaded dynamically
// from the marketplace via ModuleContext.
//
// CORE Routes (hardcoded):
// - Public: Landing, Login, Activation, ForgotPassword
// - Core Features: Dashboard, Settings
// - Admin: System Admin, Module Management
//
// Everything else should come from marketplace modules.
// =============================================================================

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/KeycloakAuthContext';
import { NekazariI18nProvider } from '@nekazari/sdk';
import { I18nProvider } from '@/context/I18nContext';
import { ModuleProvider, useModules } from '@/context/ModuleContext';
import { ViewerProvider } from '@/context/ViewerContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AdminRoute, FarmerRoute, ModulesRoute } from '@/components/KeycloakProtectedRoute';
import { RemoteModuleLoader } from '@/components/RemoteModuleLoader';
import { Layout } from '@/components/Layout';
import { UnifiedViewer } from '@/components/UnifiedViewer';

// CORE Pages (essential for platform operation)
import { Landing } from '@/pages/Landing';
import { ForgotPassword } from '@/pages/ForgotPassword';
import KeycloakLogin from '@/pages/KeycloakLogin';
import { Activation } from '@/pages/Activation';
import { DashboardImproved } from '@/pages/DashboardImproved';
import { Settings } from '@/pages/Settings';
import { AdminPanel } from '@/pages/AdminPanel';
import { Modules } from '@/pages/admin/Modules';
// Entities page replaced by UnifiedViewer (Unified Command Center)
import { AlertCenter } from '@/pages/AlertCenter';
import { Risks } from '@/pages/Risks';
import { IntelligenceInfoPage } from '@/pages/IntelligenceInfoPage';
import { NotFound } from '@/components/error/NotFound';
import MobileViewer from '@/pages/MobileViewer';

// Dynamic routes component that includes remote modules
const DynamicRoutes = () => {
  const { modules, isLoading } = useModules();

  try {
    return (
      <Routes>
        {/* ============================================
            PUBLIC ROUTES (No authentication required)
            ============================================ */}
        <Route path="/" element={<Landing />} />
        <Route path="/mobile-viewer" element={<MobileViewer />} />
        <Route path="/login" element={<KeycloakLogin />} />
        <Route path="/activate" element={<Activation />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* ============================================
            CORE PROTECTED ROUTES (Essential platform features)
            ============================================ */}
        <Route
          path="/dashboard"
          element={
            <FarmerRoute>
              <ViewerProvider>
                <DashboardImproved />
              </ViewerProvider>
            </FarmerRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <FarmerRoute>
              <Settings />
            </FarmerRoute>
          }
        />

        {/* Unified Command Center - Main Viewer */}
        <Route
          path="/entities"
          element={
            <FarmerRoute>
              <ViewerProvider>
                <UnifiedViewer />
              </ViewerProvider>
            </FarmerRoute>
          }
        />

        {/* Redirect /viewer to /entities (simplification) */}
        <Route
          path="/viewer"
          element={<Navigate to="/entities" replace />}
        />

        <Route
          path="/alerts"
          element={
            <FarmerRoute>
              <AlertCenter />
            </FarmerRoute>
          }
        />

        <Route
          path="/risks"
          element={
            <FarmerRoute>
              <Layout>
                <Risks />
              </Layout>
            </FarmerRoute>
          }
        />

        {/* ============================================
            ADMIN ROUTES (Platform administration)
            ============================================ */}
        <Route
          path="/system-admin"
          element={
            <AdminRoute>
              <Layout>
                <AdminPanel />
              </Layout>
            </AdminRoute>
          }
        />

        <Route
          path="/admin/modules"
          element={
            <ModulesRoute>
              <Layout>
                <Modules />
              </Layout>
            </ModulesRoute>
          }
        />

        {/* ============================================
            BACKEND-ONLY MODULE ROUTES (Special handling)
            ============================================ */}
        {/* Intelligence Module - Backend-only, show info page */}
        <Route
          path="/intelligence"
          element={
            <FarmerRoute>
              <Layout>
                <IntelligenceInfoPage />
              </Layout>
            </FarmerRoute>
          }
        />

        {/* ============================================
            DYNAMIC MODULE ROUTES (Loaded from marketplace)
            Note: Pages already include their own Layout
            Modules that need ViewerContext are wrapped with ViewerProvider
            ============================================ */}
        {!isLoading && Array.isArray(modules) && modules.map((module) => {
          if (!module || !module.id || !module.routePath) {
            console.warn('[DynamicRoutes] Invalid module skipped:', module);
            return null;
          }
          // Skip intelligence route (handled statically above)
          if (module.id === 'intelligence') {
            return null;
          }
          return (
            <Route
              key={module.id}
              path={module.routePath}
              element={
                <FarmerRoute>
                  <ViewerProvider>
                    <Layout fullWidth>
                      <RemoteModuleLoader module={module} />
                    </Layout>
                  </ViewerProvider>
                </FarmerRoute>
              }
            />
          );
        })}

        {/* 404 - Not Found Page */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  } catch (error) {
    console.error('🔥 [DynamicRoutes] CRITICAL RENDER ERROR:', error);
    return null;
  }
};

const AppRoutes = () => {
  try {
    return (
      <ModuleProvider>
        <DynamicRoutes />
      </ModuleProvider>
    );
  } catch (err) {
    console.error('🔥 [AppRoutes] CRITICAL ERROR:', err);
    throw err;
  }
};

const AppInitializer = () => {
  return <AppRoutes />;
};

// Simple fallback component that shows diagnostic info
const DiagnosticFallback: React.FC<{ error?: Error | null }> = ({ error }) => (
  <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '50px auto' }}>
    <h1 style={{ color: '#dc2626' }}>⚠️ Error de Inicialización</h1>
    <p>La aplicación no pudo inicializarse correctamente.</p>
    {error && (
      <div style={{ background: '#fee2e2', padding: '15px', borderRadius: '4px', marginTop: '20px', border: '1px solid #fca5a5' }}>
        <strong style={{ color: '#dc2626' }}>Error:</strong>
        <pre style={{ marginTop: '10px', fontSize: '12px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {error.message}
          {error.stack && `\n\n${error.stack}`}
        </pre>
      </div>
    )}
    <div style={{ marginTop: '20px', padding: '15px', background: '#f0f9ff', borderRadius: '4px' }}>
      <strong>Diagnóstico:</strong>
      <ul style={{ marginTop: '10px' }}>
        <li>window.__ENV__: {typeof window !== 'undefined' && window.__ENV__ ? '✅ Disponible' : '❌ No disponible'}</li>
        <li>React: {React ? '✅ Cargado' : '❌ No cargado'}</li>
        <li>Root element: {document.getElementById('root') ? '✅ Existe' : '❌ No existe'}</li>
      </ul>
    </div>
    <button
      onClick={() => window.location.reload()}
      style={{
        marginTop: '20px',
        padding: '10px 20px',
        background: '#2563eb',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px'
      }}
    >
      🔄 Recargar Página
    </button>
  </div>
);

// Render function for ErrorBoundary fallback
const renderFallback = (error: Error | null) => <DiagnosticFallback error={error} />;

function App() {
  try {
    return (
      <BrowserRouter>
        <ErrorBoundary
          componentName="App"
          fallback={renderFallback}
        >
          <ErrorBoundary componentName="AuthProvider" fallback={renderFallback}>
            <AuthProvider>
              <ErrorBoundary componentName="I18nProvider" fallback={renderFallback}>
                <I18nProvider>
                  <ErrorBoundary componentName="NekazariI18nProvider" fallback={renderFallback}>
                    <NekazariI18nProvider
                      config={{
                        defaultLanguage: 'es',
                        fallbackLanguage: 'es',
                        supportedLanguages: ['es', 'en', 'ca', 'eu', 'fr', 'pt'],
                        loadPath: '/locales/{{lng}}/{{ns}}.json',
                        namespaces: ['common', 'navigation'],
                        debug: import.meta.env.DEV,
                      }}
                    >
                      <ErrorBoundary componentName="ThemeProvider" fallback={renderFallback}>
                        <ThemeProvider>
                          <ErrorBoundary componentName="ToastProvider" fallback={renderFallback}>
                            <ToastProvider>
                              <ErrorBoundary componentName="AppInitializer" fallback={renderFallback}>
                                <AppInitializer />
                              </ErrorBoundary>
                            </ToastProvider>
                          </ErrorBoundary>
                        </ThemeProvider>
                      </ErrorBoundary>
                    </NekazariI18nProvider>
                  </ErrorBoundary>
                </I18nProvider>
              </ErrorBoundary>
            </AuthProvider>
          </ErrorBoundary>
        </ErrorBoundary>
      </BrowserRouter>
    );
  } catch (error) {
    console.error('[App] Error in render:', error);
    return <DiagnosticFallback error={error instanceof Error ? error : new Error(String(error))} />;
  }
}

export default App;
