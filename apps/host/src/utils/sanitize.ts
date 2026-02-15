/**
 * =============================================================================
 * HTML Sanitization Utility
 * =============================================================================
 * 
 * Provides safe HTML sanitization using DOMPurify to prevent XSS attacks.
 * 
 * Usage:
 *   import { sanitizeHtml } from '@/utils/sanitize';
 *   <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(userContent) }} />
 * 
 * =============================================================================
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * @param html - Raw HTML string to sanitize
 * @param options - Optional DOMPurify configuration
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(
  html: string,
  options?: DOMPurify.Config
): string {
  if (!html) return '';

  // Default configuration: Allow safe HTML tags and attributes
  const defaultOptions: DOMPurify.Config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'class', 'id', 'target', 'rel'
    ],
    ALLOW_DATA_ATTR: false, // Disable data-* attributes for security
    KEEP_CONTENT: true, // Keep text content even if tags are removed
    RETURN_DOM: false, // Return string, not DOM
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    ...options
  };

  // Sanitize the HTML
  return DOMPurify.sanitize(html, defaultOptions);
}

/**
 * Sanitize HTML for terms and conditions (more restrictive)
 */
export function sanitizeTermsHtml(html: string): string {
  return sanitizeHtml(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    // Ensure external links open in new tab with security
    ADD_ATTR: ['target="_blank"', 'rel="noopener noreferrer"']
  });
}
