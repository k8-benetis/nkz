/**
 * Conditional logger utility.
 * Only emits output in development mode (import.meta.env.DEV).
 * In production builds, all log/debug/info calls become no-ops.
 *
 * Usage:
 *   import { logger } from '@/utils/logger';
 *   logger.debug('Token refreshed', { expiresIn });
 *   logger.warn('Slow API response', { elapsed });
 *   logger.error('Failed to fetch', error);
 */

const isDev = import.meta.env.DEV;

/* eslint-disable no-console */
const noop = () => {};

export const logger = {
  debug: isDev ? console.debug.bind(console) : noop,
  log: isDev ? console.log.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  error: console.error.bind(console), // Always emit errors
  table: isDev ? console.table.bind(console) : noop,
  group: isDev ? console.group.bind(console) : noop,
  groupEnd: isDev ? console.groupEnd.bind(console) : noop,
};
/* eslint-enable no-console */
