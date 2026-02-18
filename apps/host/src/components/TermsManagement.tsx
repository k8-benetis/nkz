// =============================================================================
// Terms Management Component - Admin Panel for Managing Terms and Conditions
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import { FileText, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { sanitizeTermsHtml } from '@/utils/sanitize';

const SUPPORTED_LANGUAGES = {
  es: 'Español',
  en: 'English',
  ca: 'Català',
  eu: 'Euskera',
  fr: 'Français',
  pt: 'Português',
};

export const TermsManagement: React.FC = () => {
  const { t, supportedLanguages: _supportedLanguages } = useI18n();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('es');
  const [termsContent, setTermsContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    loadTerms();
  }, [selectedLanguage]);

  const loadTerms = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const data = await api.getTerms(selectedLanguage);
      if (data && data.content) {
        setTermsContent(data.content);
        setLastUpdated(data.last_updated);
      } else {
        setTermsContent('');
        setLastUpdated(null);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setTermsContent('');
        setLastUpdated(null);
      } else {
        setMessage({ type: 'error', text: t('terms.error') });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const result = await api.saveTerms(selectedLanguage, termsContent);
      
      if (result.success) {
        setMessage({ type: 'success', text: t('admin.saved') });
        setLastUpdated(new Date().toISOString());
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: t('admin.save_error') });
      }
    } catch (err: any) {
      console.error('Error saving terms:', err);
      setMessage({ type: 'error', text: t('admin.save_error') });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('es-ES');
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6" />
            {t('admin.terms_management')}
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Language Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('admin.select_language')}
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t('admin.terms_for_language', { language: SUPPORTED_LANGUAGES[selectedLanguage as keyof typeof SUPPORTED_LANGUAGES] })}
            </p>
          </div>

          {/* Last Updated Info */}
          {lastUpdated && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                <strong>{t('admin.current_content')}:</strong> {formatDate(lastUpdated)}
              </p>
            </div>
          )}

          {/* Message */}
          {message && (
            <div
              className={`flex items-center gap-2 p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Terms Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('admin.terms_title')}
            </label>
            <textarea
              value={termsContent}
              onChange={(e) => setTermsContent(e.target.value)}
              placeholder={t('admin.terms_placeholder')}
              rows={15}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              {t('admin.terms_help')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <strong>Nota:</strong> Puedes usar HTML básico para formatear el texto (p, br, strong, em, ul, ol, li, h1-h6, a).
            </p>
          </div>

          {/* Preview */}
          {termsContent && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {t('admin.preview')}
              </h3>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                <div
                  className="text-sm text-gray-700 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizeTermsHtml(termsContent) }}
                />
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('admin.saving')}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {t('admin.save_terms')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

