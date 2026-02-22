import { describe, it, expect } from 'vitest';
import { normalizeAssetUrl } from '../urlNormalizer';

describe('normalizeAssetUrl', () => {
  it('returns empty string for empty or null-ish input', () => {
    expect(normalizeAssetUrl('')).toBe('');
    expect(normalizeAssetUrl(null as unknown as string)).toBe('');
    expect(normalizeAssetUrl(undefined as unknown as string)).toBe('');
  });

  it('converts absolute URLs to relative paths', () => {
    expect(normalizeAssetUrl('https://example.com/assets/model.glb'))
      .toBe('/assets/model.glb');
    expect(normalizeAssetUrl('https://example.com/modules/foo/nkz-module.js'))
      .toBe('/modules/foo/nkz-module.js');
    expect(normalizeAssetUrl('https://example.com/icons/tractor.glb?v=2'))
      .toBe('/icons/tractor.glb?v=2');
  });

  it('leaves relative paths unchanged', () => {
    expect(normalizeAssetUrl('/icons/machines/tractor.glb'))
      .toBe('/icons/machines/tractor.glb');
    expect(normalizeAssetUrl('relative/path.png'))
      .toBe('relative/path.png');
  });

  it('leaves data URIs unchanged', () => {
    expect(normalizeAssetUrl('data:image/png;base64,abc'))
      .toBe('data:image/png;base64,abc');
  });
});
