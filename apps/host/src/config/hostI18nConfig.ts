/**
 * Stable reference for NekazariI18nProvider — MUST NOT be an inline object in JSX.
 * A new object every render changes `config` identity and retriggers SDK init (see
 * packages/sdk i18n provider useEffect), which can leave i18n.t invalid → "t.t is not a function".
 */
import type { I18nConfig } from '@nekazari/sdk';

export const hostI18nConfig: I18nConfig = {
	defaultLanguage: 'es',
	fallbackLanguage: 'es',
	supportedLanguages: ['es', 'en', 'ca', 'eu', 'fr', 'pt'],
	loadPath: '/locales/{{lng}}/{{ns}}.json',
	namespaces: ['common', 'navigation', 'layout'],
	debug: import.meta.env.DEV,
};
