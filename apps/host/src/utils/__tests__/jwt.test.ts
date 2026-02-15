import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decodeJwtPayload, isTokenExpired, getTenantFromToken } from '../jwt'

// Helper: create a valid JWT token with given payload
function createTestToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = 'test-signature'
  return `${header}.${body}.${signature}`
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT token', () => {
    const token = createTestToken({
      sub: 'user-123',
      email: 'test@example.com',
      tenant_id: 'myfarm',
    })
    const payload = decodeJwtPayload(token)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('user-123')
    expect(payload!.email).toBe('test@example.com')
    expect(payload!.tenant_id).toBe('myfarm')
  })

  it('returns null for null input', () => {
    expect(decodeJwtPayload(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(decodeJwtPayload(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(decodeJwtPayload('')).toBeNull()
  })

  it('returns null for malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
  })

  it('returns null for incomplete token (missing parts)', () => {
    expect(decodeJwtPayload('header-only')).toBeNull()
  })

  it('decodes token with realm_access roles', () => {
    const token = createTestToken({
      realm_access: { roles: ['PlatformAdmin', 'TenantAdmin'] },
    })
    const payload = decodeJwtPayload(token)
    expect(payload!.realm_access!.roles).toContain('PlatformAdmin')
    expect(payload!.realm_access!.roles).toHaveLength(2)
  })

  it('decodes token with groups', () => {
    const token = createTestToken({
      groups: ['/platform', '/Farmers'],
    })
    const payload = decodeJwtPayload(token)
    expect(payload!.groups).toContain('/platform')
  })
})

describe('isTokenExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for null token', () => {
    expect(isTokenExpired(null)).toBe(true)
  })

  it('returns true for token without exp claim', () => {
    const token = createTestToken({ sub: 'user-123' })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('returns false for token expiring in the future', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    const token = createTestToken({ exp: futureExp })
    expect(isTokenExpired(token)).toBe(false)
  })

  it('returns true for token expired in the past', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60 // 1 minute ago
    const token = createTestToken({ exp: pastExp })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('returns true when token expires within buffer window', () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 15 // 15 seconds from now
    const token = createTestToken({ exp: almostExpired })
    // Default buffer is 30 seconds
    expect(isTokenExpired(token, 30)).toBe(true)
  })

  it('returns false when token expires outside buffer window', () => {
    const notYet = Math.floor(Date.now() / 1000) + 60 // 60 seconds from now
    const token = createTestToken({ exp: notYet })
    expect(isTokenExpired(token, 30)).toBe(false)
  })

  it('respects custom buffer', () => {
    const soonExp = Math.floor(Date.now() / 1000) + 10
    const token = createTestToken({ exp: soonExp })
    expect(isTokenExpired(token, 5)).toBe(false) // 5s buffer, still 10s left
    expect(isTokenExpired(token, 15)).toBe(true) // 15s buffer, only 10s left
  })
})

describe('getTenantFromToken', () => {
  it('extracts tenant_id from token', () => {
    const token = createTestToken({ tenant_id: 'myfarm' })
    expect(getTenantFromToken(token)).toBe('myfarm')
  })

  it('returns null when no tenant_id in token', () => {
    const token = createTestToken({ sub: 'user-123' })
    expect(getTenantFromToken(token)).toBeNull()
  })

  it('returns null for null token', () => {
    expect(getTenantFromToken(null)).toBeNull()
  })

  it('returns null for invalid token', () => {
    expect(getTenantFromToken('garbage')).toBeNull()
  })
})
