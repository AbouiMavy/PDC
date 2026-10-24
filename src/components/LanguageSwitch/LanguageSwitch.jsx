import { useTranslation } from 'react-i18next';

/** Global navigation control: one language selection applies to all translated pages. */
export default function LanguageSwitch({ className = '' }) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'fr';
  return (
    <div className={`pdc-language-switch ${className}`} role="group" aria-label={t('nav.language')}>
      <button type="button" lang="fr" aria-pressed={language === 'fr'} onClick={() => i18n.changeLanguage('fr')}>FR</button>
      <span aria-hidden="true">|</span>
      <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => i18n.changeLanguage('en')}>EN</button>
    </div>
  );
}
