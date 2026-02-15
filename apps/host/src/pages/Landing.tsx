// =============================================================================
// Landing Page - Modern and Attractive Design for NKZ
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, Users, Database, BarChart3, Smartphone, Lock, ArrowRight, 
  Leaf, Zap, Globe, Key, Mail, ExternalLink, CheckCircle, Sparkles
} from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/KeycloakAuthContext';
import { CookieBanner } from '@/components/CookieBanner';

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { t, setLanguage, language, supportedLanguages } = useI18n();
  const { login, isAuthenticated } = useAuth();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const handleLogin = async () => {
    console.log('[Landing] Login button clicked');
    
    if (isAuthenticated) {
      navigate('/dashboard');
      return;
    }
    
    try {
      await login(true);
    } catch (err) {
      console.error('[Landing] Login error:', err);
      const { getConfig } = await import('@/config/environment');
      const config = getConfig();
      const keycloakUrl = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        client_id: config.keycloak.clientId,
        redirect_uri: `${window.location.origin}/dashboard`,
        response_type: 'code',
        scope: 'openid',
        prompt: 'login'
      });
      window.location.href = `${keycloakUrl}?${params.toString()}`;
    }
  };

  const features = [
    {
      icon: <Database className="h-8 w-8 text-green-600" />,
      title: t('landing.features_context.title'),
      description: t('landing.features_context.description')
    },
    {
      icon: <Users className="h-8 w-8 text-green-600" />,
      title: t('landing.features_multitenant.title'),
      description: t('landing.features_multitenant.description')
    },
    {
      icon: <Lock className="h-8 w-8 text-green-600" />,
      title: t('landing.features_security.title'),
      description: t('landing.features_security.description')
    },
    {
      icon: <Smartphone className="h-8 w-8 text-green-600" />,
      title: t('landing.features_iot.title'),
      description: t('landing.features_iot.description')
    },
    {
      icon: <BarChart3 className="h-8 w-8 text-green-600" />,
      title: t('landing.features_analytics.title'),
      description: t('landing.features_analytics.description')
    },
    {
      icon: <Zap className="h-8 w-8 text-green-600" />,
      title: t('landing.features_cloud.title'),
      description: t('landing.features_cloud.description')
    }
  ];

  const handleLanguageChange = async (lang: string) => {
    await setLanguage(lang as any);
    setShowLanguageMenu(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Cookie Banner */}
      <CookieBanner />

      {/* Language Selector - Fixed Top Right */}
      <div className="fixed top-4 right-4 z-50">
        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className={`inline-flex items-center justify-center w-full rounded-lg border transition-all ${
              isScrolled 
                ? 'border-gray-300 shadow-md bg-white' 
                : 'border-gray-200 shadow-sm bg-white/90 backdrop-blur-sm'
            } px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
          >
            <Globe className="h-4 w-4 mr-2" />
            {supportedLanguages[language] || supportedLanguages['es']}
          </button>
          {showLanguageMenu && (
            <>
              <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                {Object.entries(supportedLanguages).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => handleLanguageChange(code)}
                    className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                      language === code 
                        ? 'bg-green-50 text-green-900 font-medium' 
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowLanguageMenu(false)}
              />
            </>
          )}
        </div>
      </div>

      {/* Hero Section with Image */}
      <div className="relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-green-200/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-100/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Text Content */}
            <div className="text-center lg:text-left space-y-8">
              {/* Logo/Brand */}
              <div className="flex justify-center lg:justify-start mb-6">
                <div className="relative">
                  <div className="bg-gradient-to-br from-green-500 to-green-700 p-5 rounded-2xl shadow-2xl transform hover:scale-105 transition-transform duration-300">
                    <Shield className="h-16 w-16 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2">
                    <Sparkles className="h-6 w-6 text-green-400 animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Main Title */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight">
                <span className="block">{t('landing.title') || 'NKZ'}</span>
                <span className="block bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent">
                  {t('landing.subtitle') || 'Plataforma Agrícola'}
                </span>
              </h1>

              {/* Description */}
              <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                {t('landing.description')}
              </p>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto lg:mx-0">
                {t('landing.subdescription')}
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start space-y-4 sm:space-y-0 sm:space-x-4 pt-4">
                <button
                  onClick={handleLogin}
                  className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto"
                >
                  <span className="flex items-center">
                    {t('landing.access') || t('auth.login') || 'Acceder'}
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
                <button
                  onClick={() => navigate('/activate')}
                  className="inline-flex items-center px-8 py-4 bg-white text-green-600 text-lg font-semibold rounded-xl border-2 border-green-600 shadow-md hover:shadow-lg transform hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto"
                >
                  <Key className="mr-2 h-5 w-5" />
                  {t('landing.register_with_code') || 'Registro con Código'}
                </button>
              </div>

              {/* Trust Badges */}
              <div className="flex flex-wrap justify-center lg:justify-start items-center gap-6 pt-8 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>{t('landing.trust_enterprise_security')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Leaf className="h-5 w-5 text-green-600" />
                  <span>{t('landing.trust_fiware')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  <span>{t('landing.trust_multitenant')}</span>
                </div>
              </div>
            </div>

            {/* Right Column - Image */}
            <div className="relative hidden lg:block">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-blue-400/20 rounded-3xl transform rotate-6 blur-2xl"></div>
                <div className="relative rounded-3xl shadow-2xl overflow-hidden border-4 border-white">
                  <img 
                    src="/NKZ_landing_Page.png" 
                    alt="NKZ Platform"
                    className="w-full h-auto object-cover"
                    loading="eager"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            {t('landing.features_title')}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t('landing.features_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-white p-8 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-green-200 transform hover:-translate-y-2"
            >
              <div className="mb-4 transform group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Call to Action Section */}
      <div className="relative bg-gradient-to-r from-green-600 to-green-700 py-24 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            {t('landing.cta_section_title')}
          </h2>
          <p className="text-xl text-green-50 mb-10 max-w-2xl mx-auto">
            {t('landing.cta_section_subtitle')}
          </p>
          <button
            onClick={handleLogin}
            className="inline-flex items-center px-10 py-5 bg-white text-green-600 text-lg font-semibold rounded-xl shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <span className="flex items-center">
              {t('landing.cta_section_button') || t('landing.cta') || 'Empezar'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <Shield className="h-8 w-8 text-green-400 mr-3" />
                <span className="text-2xl font-bold text-white">NKZ</span>
              </div>
              <p className="text-sm mb-4 max-w-md">
                {t('landing.footer_description') || 'Plataforma IoT agrícola de grado empresarial potenciada por FIWARE'}
              </p>
              <div className="flex items-center space-x-4 text-sm">
                <a 
                  href="https://robotika.cloud" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-gray-400 hover:text-green-400 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('landing.footer_company') || 'Robotika.cloud'}
                </a>
                <a 
                  href="mailto:kate@robotika.cloud"
                  className="flex items-center text-gray-400 hover:text-green-400 transition-colors"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {t('landing.footer_contact') || 'kate@robotika.cloud'}
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">{t('landing.footer_platform')}</h3>
              <ul className="space-y-2 text-sm">
                <li>{t('landing.footer_context')}</li>
                <li>{t('landing.footer_devices')}</li>
                <li>{t('landing.footer_analytics')}</li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">{t('landing.footer_security_title')}</h3>
              <ul className="space-y-2 text-sm">
                <li>{t('landing.footer_auth')}</li>
                <li>{t('landing.footer_rbac')}</li>
                <li>{t('landing.footer_isolation')}</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>{t('landing.footer_copyright') || '© 2025 NKZ. Todos los derechos reservados.'}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
