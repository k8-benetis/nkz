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
 */
export function sanitizeHtml(
  html: string,
  options?: Record<string, unknown>
): string {
  if (!html) return '';

  const defaultOptions = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'class', 'id', 'target', 'rel'
    ],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    ...options
  };

  return DOMPurify.sanitize(html, defaultOptions) as string;
}

/**
 * Sanitize HTML for terms and conditions (more restrictive)
 */
export function sanitizeTermsHtml(html: string): string {
  return sanitizeHtml(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ADD_ATTR: ['target="_blank"', 'rel="noopener noreferrer"']
  });
}
