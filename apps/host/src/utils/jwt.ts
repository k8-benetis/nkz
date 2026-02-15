/**
 * JWT utility functions.
 * Centralizes token decoding instead of manual atob(token.split('.')[1]) everywhere.
 *
 * Usage:
 *   import { decodeJwtPayload } from '@/utils/jwt';
 *   const payload = decodeJwtPayload(token);
 *   if (payload) { console.log(payload.tenant_id); }
 */

import { jwtDecode } from 'jwt-decode';

export interface NekazariJwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  tenant_id?: string;
  tenant_type?: string;
  groups?: string[];
  [key: string]: unknown;
}

/**
 * Decode a JWT token payload safely.
 * Returns null if the token is invalid or expired.
 */
export function decodeJwtPayload(token: string | null | undefined): NekazariJwtPayload | null {
  if (!token) return null;
  try {
    return jwtDecode<NekazariJwtPayload>(token);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired (with optional buffer in seconds).
 */
export function isTokenExpired(token: string | null | undefined, bufferSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= (payload.exp - bufferSeconds) * 1000;
}

/**
 * Extract tenant_id from a JWT token.
 */
export function getTenantFromToken(token: string | null | undefined): string | null {
  const payload = decodeJwtPayload(token);
  return payload?.tenant_id ?? null;
}
