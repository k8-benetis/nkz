import React from 'react';
import ReactDOMClient from 'react-dom/client';
import ReactDOM from 'react-dom';
import * as ReactRouterDOM from 'react-router-dom';
import * as UIKit from '@nekazari/ui-kit';
import App from './App.tsx';
import './index.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Expose React globally for remote modules (Module Federation)
// Remote modules need access to the same React instance to avoid context issues
(window as any).React = React;
// Fix: Merge standard ReactDOM (for createPortal) with Client API (for createRoot)
(window as any).ReactDOM = { ...ReactDOM, ...ReactDOMClient };
(window as any).ReactRouterDOM = ReactRouterDOM;
(window as any).__nekazariUIKit = UIKit;

// CRITICAL: Populate globalThis.__federation_shared__ EARLY for Module Federation
// This MUST be done before any remote modules are loaded
// Remote modules with import: false need these shared modules available
if (typeof globalThis !== 'undefined') {
  globalThis.__federation_shared__ = globalThis.__federation_shared__ || {};
  const scope = 'default';
  globalThis.__federation_shared__[scope] = globalThis.__federation_shared__[scope] || {};

  // Store React shared modules in the format expected by vite-plugin-federation
  // Format: globalThis.__federation_shared__[scope][name][version] = { get: () => Promise<() => module> }
  globalThis.__federation_shared__[scope]['react'] = {
    '18.3.1': {
      get: () => Promise.resolve(() => React),
    },
  };

  globalThis.__federation_shared__[scope]['react-dom'] = {
    '18.3.1': {
      get: () => Promise.resolve(() => ReactDOM),
    },
  };

  globalThis.__federation_shared__[scope]['react-router-dom'] = {
    '6.26.0': {
      get: () => Promise.resolve(() => ReactRouterDOM),
    },
  };

  // Expose ui-kit for remote modules
  globalThis.__federation_shared__[scope]['@nekazari/ui-kit'] = {
    '1.0.0': {
      get: () => Promise.resolve(() => UIKit),
    },
  };

  console.log('[main.tsx] ✅ Module Federation shared modules initialized:', Object.keys(globalThis.__federation_shared__[scope]));
}

// Global error handlers to catch ANY uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[GLOBAL ERROR]', { message, source, lineno, colno, error });
  return false;
};
window.onunhandledrejection = (event) => {
  console.error('[UNHANDLED REJECTION]', event.reason);
};

console.log('[main.tsx] Starting application initialization...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

console.log('[main.tsx] Root element found, creating React root...');

const root = ReactDOMClient.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary componentName="Application">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
