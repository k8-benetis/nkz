import { describe, it, expect } from 'vitest'
import { sanitizeHtml, sanitizeTermsHtml } from '../sanitize'

describe('sanitizeHtml', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })

  it('returns empty string for null-ish input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('')
    expect(sanitizeHtml(undefined as unknown as string)).toBe('')
  })

  it('preserves safe HTML tags', () => {
    const input = '<p>Hello <strong>world</strong></p>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('removes script tags (XSS prevention)', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('<p>Hello</p>')
  })

  it('removes event handlers (XSS prevention)', () => {
    const input = '<p onclick="alert(1)">Click me</p>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('onclick')
    expect(result).toContain('Click me')
  })

  it('removes javascript: URLs (XSS prevention)', () => {
    const input = '<a href="javascript:alert(1)">Link</a>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('javascript:')
  })

  it('preserves allowed attributes', () => {
    const input = '<a href="https://example.com" title="Example">Link</a>'
    const result = sanitizeHtml(input)
    expect(result).toContain('href="https://example.com"')
    expect(result).toContain('title="Example"')
  })

  it('removes data-* attributes', () => {
    const input = '<p data-secret="token123">Text</p>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('data-secret')
  })

  it('removes img tags (not in allowed list)', () => {
    const input = '<img src="https://evil.com/tracker.gif" />'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<img')
  })

  it('removes iframe tags', () => {
    const input = '<iframe src="https://evil.com"></iframe>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<iframe')
  })

  it('removes style attributes', () => {
    const input = '<p style="background:url(evil)">Text</p>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('style=')
  })

  it('preserves table HTML', () => {
    const input = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('preserves list HTML', () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('handles nested malicious content', () => {
    const input = '<p><strong onmouseover="alert(1)">Text</strong></p>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('onmouseover')
    expect(result).toContain('Text')
  })
})

describe('sanitizeTermsHtml', () => {
  it('is more restrictive than sanitizeHtml', () => {
    // Tables are allowed in sanitizeHtml but not in sanitizeTermsHtml
    const input = '<table><tr><td>Data</td></tr></table>'
    const termsResult = sanitizeTermsHtml(input)
    // sanitizeTermsHtml has a smaller allowlist, so table tags should be stripped
    expect(termsResult).not.toContain('<table>')
  })

  it('preserves basic formatting', () => {
    const input = '<p><strong>Important</strong> <em>text</em></p>'
    const result = sanitizeTermsHtml(input)
    expect(result).toContain('<strong>')
    expect(result).toContain('<em>')
  })

  it('preserves links', () => {
    const input = '<a href="https://example.com">Link</a>'
    const result = sanitizeTermsHtml(input)
    expect(result).toContain('href')
  })
})
