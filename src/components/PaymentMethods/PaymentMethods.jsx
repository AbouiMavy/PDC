import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    {methode === 'tara' && <fieldset className="pdc-don-form__fieldset pdc-don-form__subchoix">
      <legend>{t('donation.taraChannel')}</legend>
      <div className="pdc-don-form__civilite">
        {['whatsapp','telegram','dikalo'].map(id => <label key={id}>
          <input type="radio" name="canalTara" value={id} checked={messagerie === id} onChange={() => onMessagerieChange(id)}/>
          {id === 'whatsapp' ? 'WhatsApp' : id === 'telegram' ? 'Telegram' : 'Dikalo'}
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
