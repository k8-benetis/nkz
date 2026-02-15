// =============================================================================
// Terms Acceptance Component - Multi-language Terms and Conditions
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import { FileText, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { sanitizeTermsHtml } from '@/utils/sanitize';

interface TermsAcceptanceProps {
  onAcceptChange: (accepted: boolean) => void;
  required?: boolean;
}

interface TermsContent {
  content: string;
  last_updated: string;
  language: string;
}

export const TermsAcceptance: React.FC<TermsAcceptanceProps> = ({
  onAcceptChange,
  required = true
}) => {
  const { t, language } = useI18n();
  const [accepted, setAccepted] = useState(false);
  const [termsContent, setTermsContent] = useState<TermsContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    loadTerms();
  }, [language]);

  const loadTerms = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTerms(language);
      if (data && data.content) {
        setTermsContent(data);
      } else {
        setError(t('terms.no_terms'));
      }
    } catch (err: any) {
      console.error('Error loading terms:', err);
      if (err.response?.status === 404) {
        setError(t('terms.no_terms'));
      } else {
        setError(t('terms.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAccepted = e.target.checked;
    setAccepted(newAccepted);
    onAcceptChange(newAccepted);
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(language === 'es' ? 'es-ES' : language);
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="terms-acceptance"
          checked={accepted}
          onChange={handleAcceptChange}
          className="mt-1 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          required={required}
        />
        <div className="flex-1">
          <label htmlFor="terms-acceptance" className="text-sm text-gray-700 cursor-pointer">
            {t('terms.accept')}
          </label>
          {termsContent && (
            <p className="text-xs text-gray-500 mt-1">
              {t('terms.last_updated', { date: formatDate(termsContent.last_updated) })}
            </p>
          )}
        </div>
      </div>

      {termsContent && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTerms(!showTerms)}
            className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-sm font-medium text-gray-700"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>{t('terms.view_terms')}</span>
            </div>
            {showTerms ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {showTerms && (
            <div className="p-4 bg-white max-h-64 overflow-y-auto">
              <div
                className="text-sm text-gray-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeTermsHtml(termsContent.content) }}
              />
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('terms.loading')}</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

