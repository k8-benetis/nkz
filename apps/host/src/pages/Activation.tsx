// =============================================================================
// Activation Component - Farmer Registration with Activation Code
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/KeycloakAuthContext';
import { useI18n } from '@/context/I18nContext';
import { TermsAcceptance } from '@/components/TermsAcceptance';
import api from '@/services/api';
import axios from 'axios';
import { getConfig } from '@/config/environment';
import { validateTenantId, normalizeTenantId, getTenantIdRules } from '@/utils/tenantValidation';
import { 
  Key, 
  Mail, 
  User, 
  Building2, 
  CheckCircle, 
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Check,
  X
} from 'lucide-react';

interface ActivationFormData {
  code: string;
  email: string;
  tenant_name: string;
  password: string;
  confirm_password: string;
}

interface ActivationResponse {
  success: boolean;
  tenant_id: string;
  namespace: string;
  api_key: string;
  plan: string;
  limits: {
    max_users: number;
    max_robots: number;
    max_sensors: number;
  };
  expires_at: string;
  ros2_configured: boolean;
  keycloak_user_created: boolean;
}

export const Activation: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useI18n();
  const [formData, setFormData] = useState<ActivationFormData>({
    code: '',
    email: '',
    tenant_name: '',
    password: '',
    confirm_password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorReason, setErrorReason] = useState(''); // Razón detallada del error
  const [success, setSuccess] = useState<ActivationResponse | null>(null);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(''); // Mensaje de progreso
  const [tenantValidation, setTenantValidation] = useState<{ isValid: boolean; normalized?: string; error?: string; warnings?: string[] } | null>(null);
  
  // Password validation requirements
  interface PasswordRequirements {
    minLength: boolean;
    hasDigit: boolean;
    hasLowercase: boolean;
    hasUppercase: boolean;
    hasSpecialChar: boolean;
  }
  
  const validatePasswordRequirements = (password: string): PasswordRequirements => {
    return {
      minLength: password.length >= 8,
      hasDigit: /\d/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasUppercase: /[A-Z]/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
  };
  
  const passwordRequirements = validatePasswordRequirements(formData.password);
  const isPasswordValid = Object.values(passwordRequirements).every(req => req === true);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    
    // Validate tenant_name in real-time
    if (name === 'tenant_name' && value.trim()) {
      const validation = validateTenantId(value);
      setTenantValidation(validation);
    } else if (name === 'tenant_name' && !value.trim()) {
      setTenantValidation(null);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.code.trim()) {
      setError(t('activation.code_required'));
      return false;
    }

    if (!formData.email.trim()) {
      setError(t('activation.email_required'));
      return false;
    }

    if (!formData.tenant_name.trim()) {
      setError(t('activation.farm_name_required'));
      return false;
    }

    // Validate tenant_name format
    const tenantValidation = validateTenantId(formData.tenant_name);
    if (!tenantValidation.isValid) {
      setError(tenantValidation.error || 'Nombre de explotación inválido');
      setErrorReason(tenantValidation.warnings?.join(' ') || '');
      return false;
    }

    if (!formData.password.trim()) {
      setError(t('activation.password_required'));
      return false;
    }

    // Validate password requirements
    const requirements = validatePasswordRequirements(formData.password);
    if (!requirements.minLength) {
      setError(t('activation.password_requirement_min_length'));
      return false;
    }
    if (!requirements.hasDigit) {
      setError(t('activation.password_requirement_digit'));
      return false;
    }
    if (!requirements.hasLowercase) {
      setError(t('activation.password_requirement_lowercase'));
      return false;
    }
    if (!requirements.hasUppercase) {
      setError(t('activation.password_requirement_uppercase'));
      return false;
    }
    if (!requirements.hasSpecialChar) {
      setError(t('activation.password_requirement_special'));
      return false;
    }

    if (formData.password !== formData.confirm_password) {
      setError(t('activation.passwords_mismatch'));
      return false;
    }

    if (!termsAccepted) {
      setError(t('terms.required'));
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      setErrorReason('');
      setLoadingMessage(t('activation.processing'));

      // Ensure code is in correct format: NEK-XXXX-XXXX-XXXX
      let codeToSend = formData.code.toUpperCase().trim();
      // Remove any extra spaces or dashes, then ensure format
      codeToSend = codeToSend.replace(/\s+/g, '').replace(/-+/g, '-');
      // If it doesn't start with NEK-, add it
      if (!codeToSend.startsWith('NEK-')) {
        // Remove NEK if it exists without dash
        codeToSend = codeToSend.replace(/^NEK/i, '');
        // Remove all non-alphanumeric and format
        const cleaned = codeToSend.replace(/[^A-Z0-9]/g, '').slice(0, 12);
        if (cleaned.length >= 4) {
          codeToSend = `NEK-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
        } else {
          codeToSend = `NEK-${cleaned}`;
        }
      }
      
      setLoadingMessage(t('activation.creating_tenant'));
      
      // Activation can take longer than default timeout (30s) due to tenant provisioning
      // Create a custom axios instance with extended timeout for this operation
      const config = getConfig();
      const activationClient = axios.create({
        baseURL: config.api.baseUrl || '',
        timeout: 120000, // 2 minutes for tenant creation
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // Add auth token if available
      const token = (window as any).keycloak?.token || sessionStorage.getItem('auth_token');
      if (token) {
        activationClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await activationClient.post('/webhook/activate', {
        code: codeToSend,
        email: formData.email.toLowerCase(),
        tenant_name: formData.tenant_name,
        password: formData.password
      });

      if (response.data.success) {
        setLoadingMessage(t('activation.finalizing'));
        setSuccess(response.data);
        setStep('success');
        
        // Auto-login after successful activation
        setTimeout(() => {
          login();
        }, 3000);
      }
    } catch (err: any) {
      console.error('Activation error:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      
      // Mostrar el mensaje de error específico del backend
      const errorMessage = err.response?.data?.error || err.message || t('activation.error_activating');
      const errorReasonDetail = err.response?.data?.reason || err.response?.data?.details || '';
      
      setError(errorMessage);
      setErrorReason(errorReasonDetail);
      
      // Handle specific error types with user-friendly messages
      if (errorMessage.includes('Invalid or expired')) {
        setError(t('activation.invalid_code'));
      } else if (errorMessage.includes('Password is required')) {
        setError(t('activation.password_required'));
      } else if (errorMessage.includes('Code and email are required')) {
        setError(t('activation.code_required') + ' ' + t('activation.email_required'));
      } else if (errorMessage.includes('duplicate') || errorMessage.includes('already exists') || errorMessage.includes('UNIQUE constraint')) {
        // Tenant ID already exists
        const normalized = normalizeTenantId(formData.tenant_name);
        setError(
          `El nombre de explotación "${formData.tenant_name}" ya está en uso. ` +
          `El ID normalizado "${normalized}" ya existe en el sistema.`
        );
        setErrorReason(
          'Por favor, elige un nombre diferente. ' +
          'El sistema normaliza automáticamente los nombres (minúsculas, sin espacios ni caracteres especiales). ' +
          'Si crees que esto es un error, contacta con el soporte.'
        );
      } else if (errorMessage.includes('invalid') && errorMessage.includes('tenant')) {
        // Invalid tenant ID format
        const validation = validateTenantId(formData.tenant_name);
        setError(
          validation.error || 
          'El nombre de explotación contiene caracteres no permitidos o no cumple los requisitos.'
        );
        setErrorReason(
          getTenantIdRules().description
        );
      }
      
      // Si es timeout, dar mensaje específico
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        setError(t('activation.timeout_error'));
        setErrorReason(t('activation.timeout_reason'));
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const formatCode = (code: string) => {
    // Format code as NEK-XXXX-XXXX-XXXX (18 characters total)
    // Remove all non-alphanumeric characters and convert to uppercase
    const cleaned = code.replace(/[^A-Z0-9]/g, '').toUpperCase();
    
    // If it starts with NEK, remove it to process the rest
    let codePart = cleaned.startsWith('NEK') ? cleaned.slice(3) : cleaned;
    
    // Ensure we have exactly 12 characters for the code part
    codePart = codePart.slice(0, 12);
    
    // Format as NEK-XXXX-XXXX-XXXX
    if (codePart.length === 0) return '';
    if (codePart.length <= 4) return `NEK-${codePart}`;
    if (codePart.length <= 8) return `NEK-${codePart.slice(0, 4)}-${codePart.slice(4)}`;
    return `NEK-${codePart.slice(0, 4)}-${codePart.slice(4, 8)}-${codePart.slice(8, 12)}`;
  };

  if (step === 'success' && success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
          <div className="text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('activation.success_title')}</h1>
            <p className="text-gray-600 mb-6">
              {t('activation.success_message')}
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-green-800 mb-4">{t('activation.account_details')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-green-700"><strong>{t('activation.farm')}</strong></p>
                <p className="text-green-900">{success.tenant_id}</p>
              </div>
              <div>
                <p className="text-sm text-green-700"><strong>{t('activation.plan')}</strong></p>
                <p className="text-green-900 capitalize">{success.plan}</p>
              </div>
              <div>
                <p className="text-sm text-green-700"><strong>{t('activation.api_key')}</strong></p>
                <p className="text-green-900 font-mono text-xs break-all">{success.api_key}</p>
              </div>
              <div>
                <p className="text-sm text-green-700"><strong>{t('activation.expires')}</strong></p>
                <p className="text-green-900">{new Date(success.expires_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-blue-800 mb-4">{t('activation.plan_limits')}</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-blue-900">{success.limits.max_users}</p>
                <p className="text-sm text-blue-700">{t('activation.users')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-900">{success.limits.max_robots}</p>
                <p className="text-sm text-blue-700">{t('activation.robots')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-900">{success.limits.max_sensors}</p>
                <p className="text-sm text-blue-700">{t('activation.sensors')}</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-gray-600 mb-4">
              {t('activation.redirect_message')}
            </p>
            <button
              onClick={() => login()}
              className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition duration-200"
            >
              {t('activation.go_to_dashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
            <Key className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('activation.title')}</h1>
          <p className="text-gray-600 mt-2">{t('activation.subtitle')}</p>
        </div>

        {/* Activation Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            {t('activation.activate_account')}
          </h2>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                  {errorReason && (
                    <p className="text-xs text-red-600 mt-2">{errorReason}</p>
                  )}
                  <p className="text-xs text-red-600 mt-2">
                    {t('activation.error_help')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin flex-shrink-0" />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-blue-800">
                    {loadingMessage || t('activation.please_wait')}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {t('activation.activation_takes_time')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Activation Code */}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                {t('activation.activation_code')}
              </label>
              <input
                id="code"
                name="code"
                type="text"
                value={formData.code}
                onChange={(e) => {
                  const formatted = formatCode(e.target.value);
                  setFormData(prev => ({ ...prev, code: formatted }));
                }}
                placeholder={t('activation.activation_code_placeholder')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition font-mono text-center"
                maxLength={18}
                required
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                {t('activation.purchase_email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder={t('activation.email_placeholder')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
                required
              />
            </div>

            {/* Tenant Name */}
            <div>
              <label htmlFor="tenant_name" className="block text-sm font-medium text-gray-700 mb-2">
                {t('activation.farm_name')}
                <span className="text-xs text-gray-500 ml-2">
                  (Se normalizará automáticamente)
                </span>
              </label>
              <input
                id="tenant_name"
                name="tenant_name"
                type="text"
                value={formData.tenant_name}
                onChange={handleInputChange}
                placeholder={t('activation.farm_name_placeholder')}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent outline-none transition ${
                  tenantValidation && !tenantValidation.isValid
                    ? 'border-red-300 focus:ring-red-500'
                    : tenantValidation && tenantValidation.isValid
                    ? 'border-green-300 focus:ring-green-500'
                    : 'border-gray-300 focus:ring-green-500'
                }`}
                required
              />
              
              {/* Show normalized preview */}
              {formData.tenant_name && tenantValidation?.normalized && (
                <div className="mt-1 text-xs text-gray-600">
                  <span className="font-medium">ID normalizado:</span>{' '}
                  <span className="font-mono text-gray-800">{tenantValidation.normalized}</span>
                </div>
              )}
              
              {/* Show validation errors */}
              {tenantValidation && !tenantValidation.isValid && tenantValidation.error && (
                <div className="mt-1 text-xs text-red-600">
                  {tenantValidation.error}
                </div>
              )}
              
              {/* Show warnings */}
              {tenantValidation && tenantValidation.warnings && tenantValidation.warnings.length > 0 && (
                <div className="mt-1 text-xs text-amber-600">
                  {tenantValidation.warnings.map((warning, idx) => (
                    <div key={idx}>{warning}</div>
                  ))}
                </div>
              )}
              
              {/* Show validation rules */}
              {!formData.tenant_name && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-blue-800 mb-1">
                    Requisitos del nombre de explotación:
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• Entre {getTenantIdRules().minLength} y {getTenantIdRules().maxLength} caracteres</li>
                    <li>• Solo {getTenantIdRules().allowedChars}</li>
                    <li>• Los guiones (-) se convertirán en guiones bajos (_)</li>
                    <li>• Los espacios y caracteres especiales se eliminarán</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('activation.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={t('activation.password_placeholder')}
                  className={`w-full px-4 py-2 pr-12 border rounded-lg focus:ring-2 focus:border-transparent outline-none transition ${
                    formData.password && !isPasswordValid
                      ? 'border-red-300 focus:ring-red-500'
                      : formData.password && isPasswordValid
                      ? 'border-green-300 focus:ring-green-500'
                      : 'border-gray-300 focus:ring-green-500'
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password Requirements */}
              {formData.password && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    {t('activation.password_requirements_title')}:
                  </p>
                  <ul className="space-y-1 text-xs">
                    <li className={`flex items-center gap-2 ${passwordRequirements.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                      {passwordRequirements.minLength ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      {t('activation.password_requirement_min_length')}
                    </li>
                    <li className={`flex items-center gap-2 ${passwordRequirements.hasDigit ? 'text-green-600' : 'text-gray-500'}`}>
                      {passwordRequirements.hasDigit ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      {t('activation.password_requirement_digit')}
                    </li>
                    <li className={`flex items-center gap-2 ${passwordRequirements.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                      {passwordRequirements.hasLowercase ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      {t('activation.password_requirement_lowercase')}
                    </li>
                    <li className={`flex items-center gap-2 ${passwordRequirements.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                      {passwordRequirements.hasUppercase ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      {t('activation.password_requirement_uppercase')}
                    </li>
                    <li className={`flex items-center gap-2 ${passwordRequirements.hasSpecialChar ? 'text-green-600' : 'text-gray-500'}`}>
                      {passwordRequirements.hasSpecialChar ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      {t('activation.password_requirement_special')}
                    </li>
                  </ul>
                </div>
              )}
              
              {/* Show requirements even when password is empty */}
              {!formData.password && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-blue-800 mb-2">
                    {t('activation.password_requirements_title')}:
                  </p>
                  <ul className="space-y-1 text-xs text-blue-700">
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 flex items-center justify-center">•</span>
                      {t('activation.password_requirement_min_length')}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 flex items-center justify-center">•</span>
                      {t('activation.password_requirement_digit')}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 flex items-center justify-center">•</span>
                      {t('activation.password_requirement_lowercase')}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 flex items-center justify-center">•</span>
                      {t('activation.password_requirement_uppercase')}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 flex items-center justify-center">•</span>
                      {t('activation.password_requirement_special')}
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('activation.confirm_password')}
              </label>
              <div className="relative">
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirm_password}
                  onChange={handleInputChange}
                  placeholder={t('activation.password_placeholder')}
                  className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div>
              <TermsAcceptance
                onAcceptChange={setTermsAccepted}
                required={true}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !termsAccepted || !isPasswordValid}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('activation.activating')}
                </>
              ) : (
                <>
                  <Key className="w-5 h-5" />
                  {t('activation.activate_button')}
                </>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {t('activation.no_code')}{' '}
              <a href="#" className="text-green-600 hover:text-green-700 font-medium">
                {t('activation.buy_plan')}
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>{t('activation.footer_copyright')}</p>
          <p className="mt-2">{t('activation.footer_license')}</p>
        </div>
      </div>
    </div>
  );
};
