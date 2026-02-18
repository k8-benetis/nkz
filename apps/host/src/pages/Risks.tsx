// =============================================================================
// Risks Management Page
// =============================================================================

import React from 'react';
import { SmartRiskPanel } from '@/components/SmartRiskPanel';
import { useI18n } from '@/context/I18nContext';
export const Risks: React.FC = () => {
  const { t: _t } = useI18n();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Gestión de Riesgos y Alertas
        </h1>
        <p className="text-gray-600">
          Configura alertas contextuales basadas en tus entidades. Solo verás riesgos relevantes para tus activos.
        </p>
      </div>

      <SmartRiskPanel />
    </div>
  );
};

