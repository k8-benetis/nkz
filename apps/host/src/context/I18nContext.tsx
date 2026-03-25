// =============================================================================
// I18n Context - Compatibility Wrapper
// =============================================================================
//
// The host uses `@nekazari/sdk` (react-i18next) for SOTA i18n.
// This context exists for backward compatibility with legacy components that
// call `useI18n().t('namespace.key')`.
//
// It delegates to the SDK i18n instance and maps `namespace.key` to:
// - namespace = i18next namespace (e.g. 'common', 'navigation', 'layout')
// - key       = translation key within that namespace

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { SupportedLanguage } from '@/types';
import {
  changeLanguage,
  getCurrentLanguage,
  getSupportedLanguages,
  useTranslation,
} from '@nekazari/sdk';

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, unknown>) => string;
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

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>(getCurrentLanguage());
  const supportedLanguages = useMemo(() => getSupportedLanguages(), []);

  useEffect(() => {
    const handler = (lng: string) => {
      setLanguageState(lng.split('-')[0] as SupportedLanguage);
    };
    i18n.on('languageChanged', handler);
    return () => {
      i18n.off('languageChanged', handler);
    };
  }, [i18n]);

  const setLanguage = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
  };

  const t = (key: string, params?: Record<string, unknown>): string => {
    if (!key) return '';

    const [maybeNs, ...rest] = key.split('.');
    const knownNamespaces = new Set(['common', 'navigation', 'layout']);
    const ns = knownNamespaces.has(maybeNs) ? maybeNs : 'common';
    const realKey = knownNamespaces.has(maybeNs) ? rest.join('.') : key;

    return i18n.t(realKey, { ns, ...(params ?? {}) });
  };

  const value: I18nContextType = {
    language,
    setLanguage,
    t,
    supportedLanguages,
    isLoading: !i18n.isInitialized,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
