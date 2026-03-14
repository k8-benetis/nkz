import React, { useState } from 'react';
import { HelpCircle, X, Info, Database, Zap, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const SDMGuideInfo: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full text-xs font-semibold transition-colors border border-blue-200"
      >
        <HelpCircle className="w-4 h-4" />
        {t('wizard.sdm_guide.help_button')}
      </button>
    );
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 relative animate-in fade-in slide-in-from-top-2 duration-200">
      <button 
        onClick={() => setIsOpen(false)}
        className="absolute top-3 right-3 text-blue-400 hover:text-blue-600 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-blue-600 text-white rounded-lg">
          <Info className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-blue-900 text-lg">
          {t('wizard.sdm_guide.title')}
        </h3>
      </div>

      <p className="text-sm text-blue-800 mb-6 leading-relaxed">
        {t('wizard.sdm_guide.intro')}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Conceptos */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            {t('wizard.sdm_guide.concepts_title')}
          </h4>
          <div className="space-y-2">
            <div className="bg-white/50 p-3 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-900 leading-normal">
                {t('wizard.sdm_guide.concept_sdm')}
              </p>
            </div>
            <div className="bg-white/50 p-3 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-900 leading-normal">
                {t('wizard.sdm_guide.concept_ngsi')}
              </p>
            </div>
          </div>
        </div>

        {/* Flujo */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            {t('wizard.sdm_guide.flow_title')}
          </h4>
          <div className="space-y-2 text-[11px] text-blue-800">
            <p>{t('wizard.sdm_guide.step_1')}</p>
            <p>{t('wizard.sdm_guide.step_2')}</p>
            <p>{t('wizard.sdm_guide.step_3')}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-blue-100 flex items-center justify-between">
        <div className="flex gap-4">
          <div className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
            <ShieldCheck className="w-3 h-3" />
            {t('wizard.sdm_guide.benefit_interop')}
          </div>
        </div>
        <p className="text-[9px] text-blue-400 italic">Nekazari SOTA Standard</p>
      </div>
    </div>
  );
};
