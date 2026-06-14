/**
 * i18n initialization with locale detection (§22).
 *
 * Detection order (§22.1):
 *   user profile preference → device locale → en-US fallback
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Translation resources — bundled at build time
import enUS from './en-US/translation.json';

const DEFAULT_LOCALE = 'en-US';

export function initI18n(userLocale?: string): void {
  // §22.1 — detection order: user preference → device → fallback
  const deviceLocale = getDeviceLocale();
  const detectedLocale = userLocale ?? deviceLocale ?? DEFAULT_LOCALE;

  // Only en-US at launch (§22.2); es-US in V2, fr-CA in V3
  const supportedLocale = detectedLocale.startsWith('en') ? DEFAULT_LOCALE : DEFAULT_LOCALE;

  i18n.use(initReactI18next).init({
    resources: {
      [DEFAULT_LOCALE]: { translation: enUS },
    },
    lng: supportedLocale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: {
      // React already escapes by default
      escapeValue: false,
    },
    // §22.3 rule 3 — use i18next plural rules (not manual count === 1)
    returnObjects: true,
  });
}

/**
 * Get the device locale. In RN this would use:
 *   import { getLocales } from 'react-native-localize';
 * Here we use the Node/browser global as fallback.
 */
function getDeviceLocale(): string | undefined {
  try {
    // react-native-localize would be: getLocales()[0].languageTag
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * §22.3 rule 4 — format dates/times with Intl.DateTimeFormat.
 */
export function formatDate(date: Date | string, locale?: string): string {
  const loc = locale ?? i18n.language ?? DEFAULT_LOCALE;
  return new Intl.DateTimeFormat(loc, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(typeof date === 'string' ? new Date(date) : date);
}

export { i18n, DEFAULT_LOCALE };
