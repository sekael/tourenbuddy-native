import { getLocales, useLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { useEffect } from 'react';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';

import deCH from '@/locales/de-CH.json';
import en from '@/locales/en.json';

import { detectLocale } from './detect';
import { readLanguageChoice, writeLanguageChoice } from './language-choice';
import { SUPPORTED_LOCALES } from './supported';

const deviceLocale = (locales: readonly { languageTag: string }[]) =>
  detectLocale(locales.map((l) => l.languageTag));

/** The language picked in the app, when it is one the app has. */
const choice = () => {
  const code = readLanguageChoice();
  return SUPPORTED_LOCALES.some((l) => l.code === code) ? code : null;
};

const i18n = createInstance();

// Synchronous init with bundled catalogs: the first frame is already in the right language.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'de-CH': { translation: deCH } },
  lng: choice() ?? deviceLocale(getLocales()),
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes
});

if (Platform.OS === 'web') {
  const setLang = (lng: string) => (document.documentElement.lang = lng);
  setLang(i18n.language);
  i18n.on('languageChanged', setLang);
}

/**
 * Follows the device's preferred languages while the app runs, unless a language was picked in the
 * app. Android can change the per-app language without restarting the app; iOS restarts it.
 */
export function useDeviceLocale() {
  const locale = deviceLocale(useLocales());

  useEffect(() => {
    if (!choice() && i18n.language !== locale) i18n.changeLanguage(locale);
  }, [locale]);
}

/** Picks the app's language (Profile, as the PWA's switch): kept on the device, applied at once. */
export function setAppLanguage(code: string) {
  writeLanguageChoice(code);
  void i18n.changeLanguage(code);
}

export default i18n;
