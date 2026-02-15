// =============================================================================
// Language Selector Component - Reusable Language Switcher
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation, changeLanguage, getCurrentLanguage, getSupportedLanguages, SupportedLanguage } from '@nekazari/sdk';

interface LanguageSelectorProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  className = '', 
  variant = 'default' 
}) => {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState<SupportedLanguage>(getCurrentLanguage());
  const supportedLanguages = getSupportedLanguages();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setLanguage(lng.split('-')[0] as SupportedLanguage);
    };
    
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleLanguageChange = async (lang: string) => {
    await changeLanguage(lang as SupportedLanguage);
    setShowMenu(false);
  };

  if (variant === 'compact') {
    return (
      <div className={`relative inline-block ${className}`} ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="inline-flex items-center justify-center w-full rounded-md border border-gray-300 shadow-sm px-3 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <Globe className="h-4 w-4 mr-2" />
          <span className="text-xs">{supportedLanguages[language] || supportedLanguages['es']}</span>
        </button>
        {showMenu && (
          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
            {Object.entries(supportedLanguages).map(([code, name]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`block w-full text-left px-4 py-2 text-sm ${
                  language === code 
                    ? 'bg-green-50 text-green-900' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className="inline-flex items-center justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        <Globe className="h-5 w-5 mr-2" />
        {supportedLanguages[language] || supportedLanguages['es']}
      </button>
      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
          {Object.entries(supportedLanguages).map(([code, name]) => (
            <button
              key={code}
              onClick={() => handleLanguageChange(code)}
              className={`block w-full text-left px-4 py-2 text-sm ${
                language === code 
                  ? 'bg-green-50 text-green-900' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;

