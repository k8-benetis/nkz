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
  error?: string;
  warnings?: string[];
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
      error: 'El nombre de la explotación no puede estar vacío'
    };
  }

  const normalized = normalizeTenantId(input);
  const warnings: string[] = [];

  // Check if normalization changed the input
  if (input.toLowerCase().trim() !== normalized && normalized) {
    warnings.push(
      `El nombre se normalizará a: "${normalized}". ` +
      'Los caracteres especiales, espacios y mayúsculas se convertirán automáticamente.'
    );
  }

  // Validate length
  if (normalized.length < MIN_TENANT_ID_LENGTH) {
    return {
      isValid: false,
      normalized,
      error: `El nombre debe tener al menos ${MIN_TENANT_ID_LENGTH} caracteres después de la normalización. ` +
             `Actualmente tiene ${normalized.length} caracteres.`,
      warnings
    };
  }

  if (normalized.length > MAX_TENANT_ID_LENGTH) {
    return {
      isValid: false,
      normalized,
      error: `El nombre debe tener como máximo ${MAX_TENANT_ID_LENGTH} caracteres después de la normalización. ` +
             `Actualmente tiene ${normalized.length} caracteres.`,
      warnings
    };
  }

  // Validate characters
  if (!ALLOWED_CHARS_PATTERN.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'El nombre contiene caracteres no permitidos. ' +
             'Solo se permiten letras minúsculas, números y guiones bajos.',
      warnings
    };
  }

  return {
    isValid: true,
    normalized,
    warnings: warnings.length > 0 ? warnings : undefined
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

