/**
 * Normalize asset URLs that may still point to the legacy domain.
 * Use before passing any URL to Cesium (model.uri, billboard.image) or other asset loading.
 */
export function normalizeAssetUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  return url.replace('nekazari.artotxiki.com', 'nekazari.robotika.cloud');
}
