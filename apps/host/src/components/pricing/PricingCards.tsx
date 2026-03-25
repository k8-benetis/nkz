import React from 'react';
import { useI18n } from '@/context/I18nContext';
import { Check } from 'lucide-react';

export const PricingCards: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative" id="pricing">
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          {t('landing.pricing.title') || 'Planes adaptados a tu terreno'}
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          {t('landing.pricing.subtitle') || 'Comienza gratis durante 45 días y mejora cuando lo necesites.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* Pro Tier */}
        <div className="bg-white rounded-3xl shadow-xl border-2 border-green-500 overflow-hidden transform transition-all duration-300 hover:scale-105 relative">
          <div className="absolute top-0 right-0 bg-green-500 text-white px-4 py-1 rounded-bl-lg font-medium text-sm">
            {t('landing.pricing.popular') || 'Más Popular'}
          </div>
          <div className="p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('landing.pricing.pro.title') || 'Pro'}</h3>
            <div className="flex items-baseline mb-4">
              <span className="text-4xl font-extrabold text-gray-900">{t('landing.pricing.pro.price') || '49€'}</span>
              <span className="text-xl text-gray-500 ml-2">{t('landing.pricing.pro.period') || '/mo'}</span>
            </div>
            <p className="text-gray-600 mb-6">{t('landing.pricing.pro.desc') || 'For professional agronomists and mid-size farms.'}</p>
            <ul className="space-y-4 mb-8">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.pro.feat1') || '45-day free trial'}</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.pro.feat2') || 'Up to 500 hectares and 5 users'}</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.pro.feat3') || 'All modules included'}</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.pro.feat4') || 'Priority support'}</span>
              </li>
            </ul>
            <a
              href="/register"
              className="block w-full py-4 px-6 text-center rounded-xl bg-gradient-to-r from-green-500 to-green-700 text-white font-bold text-lg shadow-md hover:shadow-xl transition-all"
            >
              {t('landing.pricing.pro.cta') || 'Start Free Trial'}
            </a>
          </div>
        </div>

        {/* Enterprise Tier */}
        <div className="bg-gray-50 rounded-3xl shadow-lg border border-gray-200 overflow-hidden transform transition-all duration-300 hover:-translate-y-2">
          <div className="p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('landing.pricing.ent.title') || 'Enterprise'}</h3>
            <div className="flex items-baseline mb-4">
              <span className="text-4xl font-extrabold text-gray-900">{t('landing.pricing.ent.price') || 'Custom'}</span>
            </div>
            <p className="text-gray-600 mb-6">{t('landing.pricing.ent.desc') || 'For cooperatives, large estates and institutions.'}</p>
            <ul className="space-y-4 mb-8">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.ent.feat1') || 'Unlimited hectares and users'}</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.ent.feat2') || 'All modules included (AI, Lidar, etc.)'}</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.ent.feat3') || 'Dedicated tenant isolation'}</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 shrink-0 mt-0.5" />
                <span className="text-gray-700">{t('landing.pricing.ent.feat4') || 'SLA and account manager'}</span>
              </li>
            </ul>
            <a
              href={`mailto:${(window as any).__ENV__?.SALES_EMAIL || 'sales@example.com'}`}
              className="block w-full py-4 px-6 text-center rounded-xl bg-white text-gray-900 border-2 border-gray-300 font-bold text-lg hover:border-gray-900 transition-all"
            >
              {t('landing.pricing.ent.cta') || 'Contact Sales'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
