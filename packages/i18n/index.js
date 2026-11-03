// Tiny locale helper shared by the apps. The JSON files are the website's own
// (frontend-next/localization) plus an `app` block for app-only strings.
import ar from './locales/ar.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import ur from './locales/ur.json' with { type: 'json' };

export const locales = ['ur', 'en', 'ar'];
export const defaultLocale = 'ur';
export const messages = { ur, en, ar };

export function isRtl(locale) {
  return locale === 'ur' || locale === 'ar';
}

/** Look up "a.b.c" in the locale's messages, falling back to Urdu, then the key. */
export function translate(locale, key, params) {
  const read = (obj) => key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
  let value = read(messages[locale]) ?? read(messages[defaultLocale]) ?? key;
  if (typeof value !== 'string') return key;
  if (params) {
    for (const [name, v] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(v));
  }
  return value;
}
