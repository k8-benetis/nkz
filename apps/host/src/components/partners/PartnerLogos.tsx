import React from 'react';
import { useI18n } from '@/context/I18nContext';

interface Partner {
  name: string;
  url: string;
  logo: string;
}

/**
 * Reads partner list from window.__ENV__.PARTNERS_JSON (JSON string)
 * or falls back to a single "Powered by FIWARE" placeholder.
 *
 * Example env value:
 *   PARTNERS_JSON='[{"name":"Acme","url":"https://acme.example","logo":"/modules/assets/logo-acme.png"}]'
 */
function getPartners(): Partner[] {
  try {
    const raw = (window as any).__ENV__?.PARTNERS_JSON;
    if (!raw) return [];
    // raw may be a JS array (from external script) or a JSON string (from inline config)
    const parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* ignore malformed JSON */ }
  return [];
}

export const PartnerLogos: React.FC = () => {
  const { t } = useI18n();
  const partners = React.useMemo(() => getPartners(), []);

  if (partners.length === 0) return null;

  return (
    <div className="w-full bg-white py-16 border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-10">
          {t('landing.partners_title') || 'Partners'}
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24">
          {partners.map((partner, index) => (
            <a
              key={index}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              title={partner.name}
              className="group block relative transition-transform duration-300 transform hover:scale-110"
            >
              <img
                src={partner.logo}
                alt={partner.name}
                loading="lazy"
                className="max-h-16 w-auto object-contain opacity-70 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
              />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};