// =============================================================================
// I18n Context - Multi-language Support
// =============================================================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SupportedLanguage, Translations } from '@/types';
import { logger } from '@/utils/logger';

interface I18nContextType {
  language: SupportedLanguage;
  translations: Translations;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
  supportedLanguages: Record<string, string>;
  isLoading: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};

interface I18nProviderProps {
  children: ReactNode;
}

const DEFAULT_LANGUAGE: SupportedLanguage = 'es';

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [translations, setTranslations] = useState<Translations>({});
  const [supportedLanguages, setSupportedLanguages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load translations from local files
  useEffect(() => {
    const loadTranslations = async () => {
      setIsLoading(true);
      try {
        logger.debug(`[I18n] Loading translations for '${language}'`);
        const fetchUrl = `/locales/${language}.json`;
        logger.debug('[I18n] Fetch URL:', fetchUrl);
        // Añadir timeout para evitar que se quede bloqueado
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
        
        const response = await fetch(`/locales/${language}.json`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          logger.debug(`[I18n] Successfully loaded translations for ${language}, keys:`, Object.keys(data).length);
          setTranslations(data);
        } else {
          logger.warn(`Translations for ${language} not found (status ${response.status}), attempting dynamic import fallback`);
          // Fallback: try dynamic import from bundled assets
          try {
            // Note: dynamic import path must match build-time assets
            // This works when locales are bundled into the app
             
            const mod = await import(/* @vite-ignore */ `/locales/${language}.json`);
            const fallbackData = mod.default || mod;
            logger.debug(`[I18n] Fallback dynamic import succeeded for ${language}, keys:`, Object.keys(fallbackData).length);
            setTranslations(fallbackData as Translations);
          } catch (impErr) {
            logger.warn('[I18n] Dynamic import fallback failed:', impErr);
            // Último fallback: cargar español
            if (language !== 'es') {
              logger.debug('[I18n] Attempting to load Spanish as final fallback');
              try {
                const esResponse = await fetch('/locales/es.json');
                if (esResponse.ok) {
                  const esData = await esResponse.json();
                  logger.debug('[I18n] Loaded Spanish as final fallback, keys:', Object.keys(esData).length);
                  setTranslations(esData);
                }
              } catch (esErr) {
                logger.error('[I18n] Failed to load Spanish fallback:', esErr);
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.warn('Translation load timeout, continuing without translations');
        } else {
          logger.error('Error loading translations:', error);
        }
        // Continuar sin traducciones en lugar de bloquear
      } finally {
        setIsLoading(false);
      }
    };

    loadTranslations();
  }, [language]);

  // Set supported languages
  useEffect(() => {
    setSupportedLanguages({
      es: 'Español',
      en: 'English',
      ca: 'Català',
      eu: 'Euskera',
      fr: 'Français',
      pt: 'Português',
    });
  }, []);

  // Initialize language from localStorage or browser
  useEffect(() => {
    const storedLang = localStorage.getItem('language') as SupportedLanguage;
    if (storedLang) {
      setLanguageState(storedLang);
    } else {
      // Detect browser language
      const browserLang = navigator.language.split('-')[0] as SupportedLanguage;
      if (['es', 'en', 'ca', 'eu', 'fr', 'pt'].includes(browserLang)) {
        setLanguageState(browserLang);
      }
    }
  }, []);

  const setLanguage = async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    // Si las traducciones aún no están cargadas, intentar cargar español como fallback
    if (Object.keys(translations).length === 0) {
      logger.warn(`[I18n] Translations not loaded yet, key: ${key}`);
      // Si no hay traducciones y el idioma no es español, intentar cargar español
      if (language !== 'es' && isLoading === false) {
        logger.warn(`[I18n] Translations empty for ${language}, falling back to Spanish`);
        // Intentar cargar español como fallback
        fetch('/locales/es.json')
          .then(res => res.json())
          .then(data => {
            setTranslations(data);
            logger.debug('[I18n] Loaded Spanish as fallback');
          })
          .catch(err => {
            logger.error('[I18n] Failed to load Spanish fallback:', err);
          });
      }
      // Devolver la clave con un prefijo para debugging, o la clave directamente
      return key;
    }

    const keys = key.split('.');
    let value: any = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Si no se encuentra la traducción, loguear para debugging
        logger.warn(`[I18n] Translation key not found: ${key} (language: ${language})`);
        // Devolver la clave para que sea visible que falta la traducción
        return key;
      }
    }

    if (typeof value === 'string') {
      // Replace parameters in string
      if (params) {
        return Object.entries(params).reduce(
          (str, [paramKey, val]) => str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), val),
          value
        );
      }
      return value;
    }

    // Si el valor no es un string, devolver la clave
    logger.warn(`[I18n] Translation value is not a string for key: ${key}`);
    return key;
  };

  const value: I18nContextType = {
    language,
    translations,
    setLanguage,
    t,
    supportedLanguages,
    isLoading,
  };

  // No bloquear el render mientras carga - siempre renderizar children
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
