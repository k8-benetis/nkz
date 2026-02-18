import { describe, it, expect } from 'vitest';
import {
    formatFileSize,
    getMaxFileSizeMB,
    isValidIconFile,
    isValid3DModelFile
} from '../minioAssets';

describe('minioAssets Utils', () => {
    describe('formatFileSize', () => {
        it('should format 0 bytes', () => {
            expect(formatFileSize(0)).toBe('0 Bytes');
        });

        it('should format KB correctly', () => {
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(1536)).toBe('1.5 KB');
        });

        it('should format MB correctly', () => {
            expect(formatFileSize(1024 * 1024)).toBe('1 MB');
        });

        it('should format GB correctly', () => {
            expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
        });
    });

    describe('getMaxFileSizeMB', () => {
        it('should return correct limit for icons', () => {
            expect(getMaxFileSizeMB('icon')).toBe(5);
        });

        it('should return correct limit for models', () => {
            expect(getMaxFileSizeMB('model')).toBe(50);
        });
    });

    describe('isValidIconFile', () => {
        it('should return true for valid image types', () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            expect(isValidIconFile(file)).toBe(true);
        });

        it('should return true for valid extensions even if type is missing/generic', () => {
            const file = new File([''], 'test.svg', { type: '' });
            expect(isValidIconFile(file)).toBe(true);
        });

        it('should return false for invalid types', () => {
            const file = new File([''], 'test.txt', { type: 'text/plain' });
            expect(isValidIconFile(file)).toBe(false);
        });
    });

    describe('isValid3DModelFile', () => {
        it('should return true for glb files', () => {
            const file = new File([''], 'model.glb', { type: 'model/gltf-binary' });
            expect(isValid3DModelFile(file)).toBe(true);
        });

        it('should return false for non-model files', () => {
            const file = new File([''], 'image.png', { type: 'image/png' });
            expect(isValid3DModelFile(file)).toBe(false);
        });
    });
});
