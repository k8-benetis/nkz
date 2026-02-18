import { describe, it, expect } from 'vitest';
import { normalizeAssetUrl } from '../urlNormalizer';

describe('normalizeAssetUrl', () => {
  it('returns empty string for empty or null-ish input', () => {
    expect(normalizeAssetUrl('')).toBe('');
    expect(normalizeAssetUrl(null as unknown as string)).toBe('');
    expect(normalizeAssetUrl(undefined as unknown as string)).toBe('');
  });

  it('replaces legacy domain with robotika.cloud', () => {
    expect(normalizeAssetUrl('https://nekazari.artotxiki.com/assets/model.glb'))
      .toBe('https://nekazari.robotika.cloud/assets/model.glb');
    expect(normalizeAssetUrl('https://nekazari.artotxiki.com/modules/foo/nkz-module.js'))
      .toBe('https://nekazari.robotika.cloud/modules/foo/nkz-module.js');
  });

  it('leaves URLs without legacy domain unchanged', () => {
    expect(normalizeAssetUrl('https://nekazari.robotika.cloud/host/index.html'))
      .toBe('https://nekazari.robotika.cloud/host/index.html');
    expect(normalizeAssetUrl('/icons/machines/tractor.glb')).toBe('/icons/machines/tractor.glb');
    expect(normalizeAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
