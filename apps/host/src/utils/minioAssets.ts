/**
 * MinIO Asset Upload Utilities
 * 
 * Handles client-side uploads to MinIO Storage for entity icons and 3D models.
 * Replaces Vercel Blob with local MinIO storage for data sovereignty.
 * 
 * The backend handles the actual upload, so this is a thin wrapper around the API.
 */

import api from '@/services/api';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
}

export interface AssetUploadResponse {
  url: string;
  asset_id: string;
  key: string;
  size: number;
  content_type: string;
  tenant_id: string;
}

/**
 * Upload a file to MinIO via the Asset Service
 * 
 * @param file - File to upload
 * @param assetType - 'model' for 3D models or 'icon' for images
 * @param options - Upload options including progress callback
 * @returns Public URL of the uploaded file
 */
export async function uploadToMinIO(
  file: File,
  assetType: 'model' | 'icon' = 'model',
  options: UploadOptions = {}
): Promise<string> {
  try {
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('asset_type', assetType);

    // Upload via API with progress tracking
    const response = await api.uploadAsset(formData, {
      onUploadProgress: (progressEvent: any) => {
        if (options.onProgress && progressEvent.total) {
          options.onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage: Math.round((progressEvent.loaded * 100) / progressEvent.total)
          });
        }
      }
    });

    return response.url;
  } catch (error: any) {
    console.error('Error uploading to MinIO:', error);
    throw new Error(
      error.response?.data?.error || 
      error.message || 
      'Failed to upload file to MinIO'
    );
  }
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use uploadToMinIO instead
 */
export async function uploadToVercelBlob(
  file: File,
  options: UploadOptions = {}
): Promise<string> {
  // Determine asset type from file
  const assetType = isValid3DModelFile(file) ? 'model' : 'icon';
  return uploadToMinIO(file, assetType, options);
}

/**
 * Delete an asset from MinIO
 */
export async function deleteFromMinIO(
  assetId: string,
  assetType: 'model' | 'icon',
  extension?: string
): Promise<void> {
  try {
    await api.deleteAsset(assetId, assetType, extension);
  } catch (error: any) {
    console.error('Error deleting from MinIO:', error);
    throw new Error(
      error.response?.data?.error || 
      error.message || 
      'Failed to delete file from MinIO'
    );
  }
}

/**
 * Get a fresh URL for an asset (useful if URL expired)
 */
export async function getAssetUrl(
  assetId: string,
  assetType: 'model' | 'icon',
  extension?: string
): Promise<string> {
  try {
    const response = await api.getAssetUrl(assetId, assetType, extension);
    return response.url;
  } catch (error: any) {
    console.error('Error getting asset URL:', error);
    throw new Error(
      error.response?.data?.error || 
      error.message || 
      'Failed to get asset URL'
    );
  }
}

/**
 * Validate file type for icons
 */
export function isValidIconFile(file: File): boolean {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
  const validExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
  
  const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  return validTypes.includes(file.type) || validExtensions.includes(extension);
}

/**
 * Validate file type for 3D models
 */
export function isValid3DModelFile(file: File): boolean {
  const validTypes = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'];
  const validExtensions = ['.glb', '.gltf'];
  
  const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  return validTypes.includes(file.type) || validExtensions.includes(extension);
}

/**
 * Get max file size in MB
 */
export function getMaxFileSizeMB(fileType: 'icon' | 'model'): number {
  return fileType === 'icon' ? 5 : 50;  // Increased limits for MinIO
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Extract asset ID from MinIO URL
 */
export function extractAssetIdFromUrl(url: string): string | null {
  try {
    // URL format: {endpoint}/{bucket}/{tenant}/{type}/{asset_id}.{ext}
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const assetId = filename.split('.')[0];
    return assetId;
  } catch {
    return null;
  }
}

