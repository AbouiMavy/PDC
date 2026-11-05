import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './PaymentMethodsT12.css';

// Une seule grille pour Soutenir et Adherer. Aucun appel de paiement ici.
export const PAYMENT_METHODS = Object.freeze(['mobile', 'tara', 'carte', 'virement']);
const RIB = Object.freeze({
  titulaire: 'PARTI DES DEMOCRATES CAMEROUNAIS',
  banque: 'BICEC', domiciliation: 'Yaoundé',
  iban: 'CM2110001068639927716300280', bic: 'ICLRCMCXXXX',
});

/**
 * Le choix décrit le souhait du contributeur, pas le statut d'un paiement.
 * Surtout ne jamais utiliser le generalLink multi-moyens en substitution
 * silencieuse d'une route de paiement spécifique non documentée.
 */
export default function PaymentMethods({
  methode, onMethodeChange, messagerie, onMessagerieChange,
  mobileMode='sms', onMobileModeChange=()=>{}, mobilePhone='', onMobilePhoneChange=()=>{},
  titleId = 'pdc-paiement', titlePrefix = '',
}) {
  const { t } = useTranslation();
  const [copie, setCopie] = useState('');
  async function copier(value, field) {
    try { await navigator.clipboard.writeText(value); setCopie(field); }
    catch { setCopie('error'); }
  }
  return <section className="pdc-don-form__section" aria-labelledby={titleId}>
    <h2 id={titleId}>{titlePrefix ? `${titlePrefix}${t('donation.paymentTitle').replace(/^\s*5\.\s*/, '')}` : t('donation.paymentTitle')}</h2>
    <div className="pdc-don-form__methodes">
      {PAYMENT_METHODS.map(id => <label key={id} className={`pdc-don-form__methode ${methode === id ? 'is-selected' : ''}`}>
        <input type="radio" name="modePaiement" value={id} checked={methode === id} onChange={() => onMethodeChange(id)}/>
        <span><strong>{t(`donation.methods.${id}`)}</strong><small>{t(`donation.methodDetails.${id}`)}</small></span>
      </label>)}
    </div>
    {methode === 'mobile' && <fieldset className="pdc-don-form__mobile-routes">
      <legend>{t('donation.mobileRouteTitle')}</legend>
      <label className="pdc-t12-route"><input type="radio" name="mobileRoute" value="sms"
        checked={mobileMode==='sms'} onChange={()=>onMobileModeChange('sms')}/>
        <span><strong>{t('donation.mobileSms')}</strong><small>{t('donation.mobileSmsDetails')}</small></span>
      </label>
      <label className="pdc-t12-route"><input type="radio" name="mobileRoute" value="direct"
        checked={mobileMode==='direct'} onChange={()=>onMobileModeChange('direct')}/>
        <span><strong>{t('donation.mobileDirect')}</strong><small>{t('donation.mobileDirectDetails')}</small></span>
      </label>
      {mobileMode==='direct' && <div className="pdc-t12-direct">
        <label htmlFor={`${titleId}-direct-number`}>{t('donation.mobileDebitPhone')}</label>
        <div className="pdc-t12-number"><span>+237</span><input id={`${titleId}-direct-number`}
          type="tel" inputMode="tel" autoComplete="off" placeholder="6XX XXX XXX"
          required maxLength={20} value={mobilePhone} onChange={e=>onMobilePhoneChange(e.target.value)}/></div>
        <p>{t('donation.mobileDirectWarning')}</p>
      </div>}
    </fieldset>}
    {methode === 'tara' && <fieldset className="pdc-don-form__fieldset pdc-don-form__subchoix">
      <legend>{t('donation.taraChannel')}</legend>
      <div className="pdc-don-form__civilite">
        {['general','whatsapp','telegram','dikalo'].map(id => <label key={id}>
          <input type="radio" name="canalTara" value={id} checked={messagerie === id} onChange={() => onMessagerieChange(id)}/>
          {id === 'general' ? t('donation.taraGeneral') : id === 'whatsapp' ? 'WhatsApp' : id === 'telegram' ? 'Telegram' : 'Dikalo'}
        </label>)}
      </div>
    </fieldset>}
    {methode !== 'virement' && <p className="pdc-don-form__aide">
      {t(`donation.${methode === 'mobile' ? 'mobileHelp' : methode === 'tara' ? 'taraHelp' : 'cardHelp'}`)}
    </p>}
    {methode === 'virement' && <div className="pdc-don-form__rib">
      <h3>{t('donation.bankTitle')}</h3>
      <dl>
        <div><dt>{t('donation.owner')}</dt><dd>{RIB.titulaire}</dd></div>
        <div><dt>{t('donation.bank')}</dt><dd>{RIB.banque} — {RIB.domiciliation}</dd></div>
        <div><dt>IBAN</dt><dd className="pdc-don-form__iban"><code>{RIB.iban}</code>
          <button type="button" onClick={() => copier(RIB.iban,'iban')}>{t('donation.ibanCopy')}</button></dd></div>
        <div><dt>BIC / SWIFT</dt><dd><code>{RIB.bic}</code>
          <button type="button" onClick={() => copier(RIB.bic,'bic')}>{t('donation.bicCopy')}</button></dd></div>
      </dl>
      {copie && <small role="status">{t(copie === 'iban' ? 'donation.copiedIban' : copie === 'bic' ? 'donation.copiedBic' : 'donation.copyFail')}</small>}
      <p className="pdc-don-form__aide">{t('donation.bankHelp')}</p>
    </div>}
  </section>;
}
