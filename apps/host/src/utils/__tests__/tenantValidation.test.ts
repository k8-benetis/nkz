import { describe, it, expect } from 'vitest'
import {
  normalizeTenantId,
  validateTenantId,
  getTenantIdRules,
} from '../tenantValidation'

describe('normalizeTenantId', () => {
  it('converts to lowercase', () => {
    expect(normalizeTenantId('MyFarm')).toBe('myfarm')
  })

  it('replaces hyphens with underscores', () => {
    expect(normalizeTenantId('my-farm-name')).toBe('my_farm_name')
  })

  it('removes special characters', () => {
    expect(normalizeTenantId('farm@#$%!')).toBe('farm')
  })

  it('removes spaces', () => {
    expect(normalizeTenantId('my farm')).toBe('myfarm')
  })

  it('trims leading/trailing underscores', () => {
    expect(normalizeTenantId('__farm__')).toBe('farm')
  })

  it('handles empty string', () => {
    expect(normalizeTenantId('')).toBe('')
  })

  it('handles mixed input', () => {
    expect(normalizeTenantId('  Mi-Granja 123! ')).toBe('mi_granja123')
  })

  it('preserves numbers', () => {
    expect(normalizeTenantId('farm42')).toBe('farm42')
  })

  it('handles unicode characters', () => {
    // ñ is not in [a-z0-9_], so it gets stripped
    expect(normalizeTenantId('grañja')).toBe('graja')
  })
})

describe('validateTenantId', () => {
  it('accepts valid tenant ID', () => {
    const result = validateTenantId('myfarm')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('myfarm')
    expect(result.error).toBeUndefined()
  })

  it('rejects empty string', () => {
    const result = validateTenantId('')
    expect(result.isValid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects whitespace-only string', () => {
    const result = validateTenantId('   ')
    expect(result.isValid).toBe(false)
  })

  it('rejects too-short tenant ID after normalization', () => {
    const result = validateTenantId('ab')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('3')
  })

  it('rejects too-long tenant ID', () => {
    const longId = 'a'.repeat(64)
    const result = validateTenantId(longId)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('63')
  })

  it('accepts maximum length tenant ID', () => {
    const maxId = 'a'.repeat(63)
    const result = validateTenantId(maxId)
    expect(result.isValid).toBe(true)
  })

  it('adds warning when normalization changes input', () => {
    const result = validateTenantId('My-Farm')
    expect(result.isValid).toBe(true)
    expect(result.warnings).toBeDefined()
    expect(result.warnings!.length).toBeGreaterThan(0)
  })

  it('no warnings when input is already normalized', () => {
    const result = validateTenantId('myfarm')
    expect(result.warnings).toBeUndefined()
  })

  it('handles input that normalizes to empty string', () => {
    const result = validateTenantId('!!!')
    expect(result.isValid).toBe(false)
  })
})

describe('getTenantIdRules', () => {
  it('returns valid rule structure', () => {
    const rules = getTenantIdRules()
    expect(rules.minLength).toBe(3)
    expect(rules.maxLength).toBe(63)
    expect(rules.allowedChars).toBeDefined()
    expect(rules.description).toBeDefined()
  })
})
