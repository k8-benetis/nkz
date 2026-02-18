/**
 * Vercel Blob Upload Utilities
 * 
 * Handles client-side uploads to Vercel Blob Storage for entity icons and 3D models.
 * The backend provides authorization tokens, and the frontend uploads directly to Vercel.
 */

import { put } from '@vercel/blob';
import api from '@/services/api';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Upload a file to Vercel Blob Storage
 * 
 * @param file - File to upload
 * @param options - Upload options including progress callback
 * @returns Public URL of the uploaded file
 */
export async function uploadToVercelBlob(
  file: File,
): Promise<string> {
  try {
    // 1. Get authorization from backend
    const { token, filename, contentType } = await api.authorizeBlobUpload({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size
    });

    // 2. Upload directly to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      token: token,
      contentType: contentType,
      // Note: @vercel/blob doesn't support onUploadProgress directly
      // We'll need to track progress differently if needed
    });

    // 3. Return public URL
    return blob.url;
  } catch (error: any) {
    console.error('Error uploading to Vercel Blob:', error);
    throw new Error(
      error.response?.data?.error || 
      error.message || 
      'Failed to upload file to Vercel Blob'
    );
  }
}

/**
 * Validate file type for icons
 */
export function isValidIconFile(file: File): boolean {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
  const validExtensions = ['.png', '.jpg', '.jpeg', '.svg'];
  
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
  return fileType === 'icon' ? 2 : 10;
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
