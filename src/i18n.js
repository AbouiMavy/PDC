import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr';
import en from './locales/en';

// Instance unique utilisée sur toutes les pages ; ne pas initialiser à nouveau dans les composants.
i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  fallbackLng: 'fr',
  supportedLngs: ['fr', 'en'],
  nonExplicitSupportedLngs: true,
  detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'], lookupLocalStorage: 'pdc_lang' },
  interpolation: { escapeValue: false },
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'fr';
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng.startsWith('en') ? 'en' : 'fr';
});
export default i18n;
