import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Merci.css';

/**
 * The server will later verify payment status before rendering an actual thank-you page.
 * Never treat a query parameter or returning from Stripe/TaraMoney as proof of payment.
 * ?preview=1 allows a harmless visual check, clearly labelled as a preview.
 */
export default function Merci() {
  const {t,i18n} = useTranslation();
  const [params] = useSearchParams();
  const preview = params.get('preview') === '1';
  const lang = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'fr';
  const [failedImage,setFailedImage] = useState('');
  const imagePath = `/images/merci-pdc-${lang}.png`;
  return <main className="pdc-merci-page"><section className="pdc-merci-card">
    <h1>{t('thanks.title')}</h1>
    <h2>{t(preview?'thanks.preview':'thanks.pending')}</h2>
    <p>{!preview && <p>{t('thanks.pendingText')}</p>}</p>
    {preview && (failedImage !== imagePath ? <img key={imagePath} src={imagePath} alt={t('thanks.preview')} onError={()=>setFailedImage(imagePath)} className="pdc-merci-image"/> : <p className="pdc-merci-placeholder">{t('thanks.unavailable')}</p>)}
    <p>{t('thanks.receipt')}</p>
    <nav className="pdc-merci-actions"><Link to="/soutenir">{t('thanks.back')}</Link><Link to="/">{t('thanks.home')}</Link></nav>
  </section></main>;
}
