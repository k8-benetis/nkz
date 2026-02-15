// =============================================================================
// Forgot Password Page - Recuperación de Contraseña
// =============================================================================

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError(t('forgot_password.email_required'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await api.post('/webhook/forgot-password', {
        email: email.toLowerCase().trim()
      });

      if (response.data.success) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(response.data.error || t('forgot_password.error'));
      }
    } catch (err: any) {
      // Even if user doesn't exist, show success (security best practice)
      if (err.response?.status === 200 || err.response?.data?.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(err.response?.data?.error || t('forgot_password.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('forgot_password.email_sent')}</h1>
          <p className="text-gray-600 mb-6">
            {t('forgot_password.email_sent_message')}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {t('forgot_password.check_spam')}
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
          >
            {t('forgot_password.back_to_login')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('forgot_password.title')}</h1>
          <p className="text-gray-600 mt-2">{t('forgot_password.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              {t('forgot_password.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('forgot_password.email_placeholder')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
              required
              disabled={loading}
            />
            <p className="mt-2 text-sm text-gray-500">
              {t('forgot_password.email_help')}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('forgot_password.sending')}
              </>
            ) : (
              <>
                <Mail className="w-5 h-5" />
                {t('forgot_password.send_link')}
              </>
            )}
          </button>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('forgot_password.back_to_login')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

