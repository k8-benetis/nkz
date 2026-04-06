// =============================================================================
// Tenant ID Validation Utilities - Frontend
// =============================================================================
// Provides client-side validation for tenant IDs to match backend normalization

const MIN_TENANT_ID_LENGTH = 3;
const MAX_TENANT_ID_LENGTH = 63; // MongoDB database name limit
const ALLOWED_CHARS_PATTERN = /^[a-z0-9_]+$/;

export interface TenantValidationResult {
  isValid: boolean;
  normalized?: string;
  /** i18n key (common namespace) for use with useI18n().t */
  errorKey?: string;
  errorParams?: Record<string, string | number>;
  /** Shown as secondary line when normalization differs from raw input */
  warningKey?: string;
  warningParams?: Record<string, string>;
}

/**
 * Normalize tenant ID to match backend normalization
 * This ensures consistency between frontend and backend
 */
export function normalizeTenantId(input: string): string {
  if (!input) return '';
  
  // Convert to lowercase
  let normalized = input.toLowerCase().trim();
  
  // Replace hyphens with underscores (MongoDB compatibility)
  normalized = normalized.replace(/-/g, '_');
  
  // Remove any characters that are not alphanumeric or underscore
  normalized = normalized.replace(/[^a-z0-9_]/g, '');
  
  // Remove leading/trailing underscores
  normalized = normalized.trim().replace(/^_+|_+$/g, '');
  
  return normalized;
}

/**
 * Validate tenant ID format and return detailed result
 */
export function validateTenantId(input: string): TenantValidationResult {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      errorKey: 'activation.tenant_name_empty',
    };
  }

  const normalized = normalizeTenantId(input);
  let warningKey: string | undefined;
  let warningParams: Record<string, string> | undefined;

  // Hint when normalization changes the visible identity (for UX only)
  if (input.toLowerCase().trim() !== normalized && normalized) {
    warningKey = 'activation.tenant_name_normalize_hint';
    warningParams = { normalized };
  }

  // Validate length
  if (normalized.length < MIN_TENANT_ID_LENGTH) {
    return {
      isValid: false,
      normalized,
      errorKey: 'activation.tenant_name_too_short',
      errorParams: {
        min: MIN_TENANT_ID_LENGTH,
        current: normalized.length,
      },
      warningKey,
      warningParams,
    };
  }

  if (normalized.length > MAX_TENANT_ID_LENGTH) {
    return {
      isValid: false,
      normalized,
      errorKey: 'activation.tenant_name_too_long',
      errorParams: {
        max: MAX_TENANT_ID_LENGTH,
        current: normalized.length,
      },
      warningKey,
      warningParams,
    };
  }

  // Validate characters
  if (!ALLOWED_CHARS_PATTERN.test(normalized)) {
    return {
      isValid: false,
      normalized,
      errorKey: 'activation.tenant_name_invalid_chars',
      warningKey,
      warningParams,
    };
  }

  return {
    isValid: true,
    normalized,
    warningKey,
    warningParams,
  };
}

/**
 * Get validation rules for display to user
 */
export function getTenantIdRules(): {
  minLength: number;
  maxLength: number;
  allowedChars: string;
  description: string;
} {
  return {
    minLength: MIN_TENANT_ID_LENGTH,
    maxLength: MAX_TENANT_ID_LENGTH,
    allowedChars: 'letras minúsculas, números y guiones bajos (_)',
    description: `El nombre de la explotación debe tener entre ${MIN_TENANT_ID_LENGTH} y ${MAX_TENANT_ID_LENGTH} caracteres. ` +
                 'Solo se permiten letras minúsculas, números y guiones bajos. ' +
                 'Los guiones (-) se convertirán automáticamente en guiones bajos (_). ' +
                 'Los espacios y caracteres especiales se eliminarán automáticamente.'
  };
}

/**
 * Check if tenant ID would be unique (client-side check only)
 * This is a helper for UI feedback, actual uniqueness is checked on backend
 */
export function checkTenantIdUniqueness(): Promise<boolean> {
  // This would typically call an API endpoint to check uniqueness
  // For now, we'll return true and let the backend handle the actual check
  return Promise.resolve(true);
}

