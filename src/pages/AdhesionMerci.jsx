import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAdhesionText } from '../features/adhesion/textes';
import './Adhesion.css';

/** Aucune réussite de paiement/admission n'est déduite des paramètres d'URL. */
export default function AdhesionMerci(){
  const {i18n}=useTranslation();
  const lang=i18n.resolvedLanguage?.startsWith('en')?'en':'fr';
  const t=getAdhesionText(lang);
  const [params]=useSearchParams();
  const preview=params.get('preview')==='1';
  const imagePath=`/images/merci-adhesion-pdc-${lang}.png`;
  const [broken,setBroken]=useState('');
  return <main className="pdc-adhesion pdc-adhesion-thanks"><section className="pdc-adhesion-card">
    <h1>{t.thanksTitle}</h1>
    <h2>{preview?t.thanksPreview:t.thanksPending}</h2>
    <p>{preview?t.thanksText:t.thanksPendingText}</p>
    {preview && (broken===imagePath?<div className="pdc-adhesion-imageslot">{t.thankMissing}</div>:<img key={imagePath} src={imagePath} alt={t.thanksPreview} className="pdc-adhesion-image" onError={()=>setBroken(imagePath)}/>)}
    <div className="pdc-adhesion-actions"><Link className="pdc-adhesion-secondary" to="/adhesion">{t.returnForm}</Link><Link className="pdc-adhesion-primary" to="/">{t.home}</Link></div>
  </section></main>;
}
