/**
 * Copyright 2025 NKZ Platform (Nekazari)
 * Licensed under Apache-2.0
 */

// =============================================================================
// i18n Provider - React Provider for i18next
// =============================================================================
// Provides i18next context to React components and handles initialization.

import React, { useEffect, useState, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { initI18n, I18nConfig, getCurrentLanguage, changeLanguage, getSupportedLanguages, SupportedLanguage } from './config';
import { i18n } from './config';

export interface NekazariI18nProviderProps {
  children: ReactNode;
  config?: I18nConfig;
  onLanguageChange?: (language: SupportedLanguage) => void;
}

/**
 * Nekazari i18n Provider
 * 
 * Wraps the application with i18next context and handles initialization.
 * All modules (Host and remotes) should use this provider to share the same
 * i18next instance.
 */
export const NekazariI18nProvider: React.FC<NekazariI18nProviderProps> = ({
  children,
  config,
  onLanguageChange,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        await initI18n(config);
        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('[NekazariI18n] Failed to initialize i18n:', error);
        if (isMounted) {
          setInitError(error instanceof Error ? error : new Error('Unknown error'));
          // Still set initialized to true to avoid blocking the app
          setIsInitialized(true);
        }
      }
    };

    initialize();

    // Listen for language changes
    const handleLanguageChanged = (lng: string) => {
      const lang = lng.split('-')[0] as SupportedLanguage;
      onLanguageChange?.(lang);
    };

    i18n.on('languageChanged', handleLanguageChanged);

    return () => {
      isMounted = false;
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [config, onLanguageChange]);

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading translations...</p>
        </div>
      </div>
    );
  }

  // Show error state if initialization failed
  if (initError) {
    console.warn('[NekazariI18n] Continuing with i18n despite initialization error');
  }

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
};

// Re-export hooks and components from react-i18next for convenience
export { useTranslation, Trans, Translation } from 'react-i18next';

// Export utility functions
export { changeLanguage, getCurrentLanguage, getSupportedLanguages };
export type { SupportedLanguage };

