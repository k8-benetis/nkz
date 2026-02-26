/**
 * Normalize asset URLs that may be stored as absolute URLs in NGSI-LD entities.
 * Converts them to relative paths so the app works on any deployment domain.
 * Use before passing any URL to Cesium (model.uri, billboard.image) or asset loaders.
 */
export function normalizeAssetUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  // Data URIs must be returned unchanged (new URL() would strip the "data:" prefix)
  if (url.startsWith('data:')) return url;
  try {
    // Convert absolute URLs to relative paths — works regardless of deployment domain
    const { pathname, search, hash } = new URL(url);
    return pathname + search + hash;
  } catch {
    // Not a valid absolute URL — return as-is (already relative)
    return url;
  }
}
