// =============================================================================
// Ornito-Radar Entry Point (Standalone Development Only)
// =============================================================================
// This file is ONLY used for standalone development (pnpm dev)
// When loaded as a remote module by the Host, App.tsx is exposed directly
// and the Host provides all providers (i18n, auth, layout)

import React from 'react';
import ReactDOM from 'react-dom/client';
import { NekazariI18nProvider } from '@nekazari/sdk';
import App from './App';
import './index.css';

// Only wrap with providers in standalone mode
// When loaded as remote, the Host provides these
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NekazariI18nProvider
      config={{
        defaultLanguage: 'es',
        fallbackLanguage: 'es',
        supportedLanguages: ['es', 'en', 'ca', 'eu', 'fr', 'pt'],
        loadPath: '/locales/{{lng}}/{{ns}}.json',
        namespaces: ['common'],
        debug: import.meta.env.DEV,
      }}
    >
      <App />
    </NekazariI18nProvider>
  </React.StrictMode>,
);
