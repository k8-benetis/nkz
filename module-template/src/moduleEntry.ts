/**
 * IIFE entry point — called when the host injects this bundle via <script>.
 * Must call window.__NKZ__.register() to activate the module.
 *
 * MODULE_ID must match the `id` column in marketplace_modules exactly.
 */
import { moduleSlots } from './slots';
import pkg from '../package.json';

const MODULE_ID = 'MODULE_NAME';

if (typeof window !== 'undefined' && window.__NKZ__) {
  window.__NKZ__.register({
    id: MODULE_ID,
    viewerSlots: moduleSlots,
    version: pkg.version,
  });
}
