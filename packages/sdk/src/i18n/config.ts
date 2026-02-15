/**
 * Copyright 2025 NKZ Platform (Nekazari)
 * Licensed under Apache-2.0
 */

// =============================================================================
// i18n Configuration - Centralized i18next Setup
// =============================================================================
// This module provides centralized i18next configuration for the NKZ platform.
// All modules (Host, Weather, NDVI, etc.) share the same i18next instance
// but can load their own translation namespaces.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export type SupportedLanguage = 'es' | 'en' | 'ca' | 'eu' | 'fr' | 'pt';

export interface I18nConfig {
  defaultLanguage?: SupportedLanguage;
  fallbackLanguage?: SupportedLanguage;
  supportedLanguages?: SupportedLanguage[];
  loadPath?: string;
  namespaces?: string[];
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<I18nConfig> = {
  defaultLanguage: 'es',
  fallbackLanguage: 'es',
  supportedLanguages: ['es', 'en', 'ca', 'eu', 'fr', 'pt'],
  loadPath: '/locales/{{lng}}/{{ns}}.json',
  namespaces: ['common'],
  debug: false,
};

/**
 * Initialize i18next with the provided configuration
 * 
 * @param config Configuration options for i18next
 * @returns Promise that resolves when i18next is initialized
 */
export async function initI18n(config: I18nConfig = {}): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Get language from localStorage or browser
  const storedLang = localStorage.getItem('language') as SupportedLanguage | null;
  const browserLang = navigator.language.split('-')[0] as SupportedLanguage;
  const detectedLang = storedLang || 
    (finalConfig.supportedLanguages.includes(browserLang) ? browserLang : finalConfig.defaultLanguage);

  await i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      lng: detectedLang,
      fallbackLng: finalConfig.fallbackLanguage,
      supportedLngs: finalConfig.supportedLanguages,
      ns: finalConfig.namespaces,
      defaultNS: 'common',
      
      // Backend configuration for loading translations
      backend: {
        loadPath: finalConfig.loadPath,
        // Allow cross-origin requests if needed
        crossDomain: false,
      },

      // Language detection
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'language',
      },

      // React i18next options
      react: {
        useSuspense: false,
      },

      // Interpolation
      interpolation: {
        escapeValue: false, // React already escapes
      },

      // Debug mode
      debug: finalConfig.debug,

      // Performance optimizations
      load: 'languageOnly', // Load 'es' instead of 'es-ES'
      cleanCode: true, // Clean language codes
    });

  // Store detected language
  if (!storedLang) {
    localStorage.setItem('language', detectedLang);
  }
}

/**
 * Change the current language
 * 
 * @param language Language code to switch to
 */
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  localStorage.setItem('language', language);
}

/**
 * Get current language
 */
export function getCurrentLanguage(): SupportedLanguage {
  return (i18n.language.split('-')[0] as SupportedLanguage) || 'es';
}

/**
 * Get supported languages with display names
 */
export function getSupportedLanguages(): Record<SupportedLanguage, string> {
  return {
    es: 'Español',
    en: 'English',
    ca: 'Català',
    eu: 'Euskera',
    fr: 'Français',
    pt: 'Português',
  };
}

// Export the i18n instance for direct access if needed
export { i18n };

