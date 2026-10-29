import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DonForm from '../components/DonForm/DonForm';
import PublicCheckoutV5C29, {publicCheckoutSandboxEnabled} from '../components/PaymentMethods/PublicCheckoutV5C29';
import './Soutenir.css';

export default function Soutenir() {
  const {t,i18n} = useTranslation();
  const [step,setStep] = useState(1);
  const [fullAppeal,setFullAppeal] = useState(false);
  const [review,setReview] = useState(null);
  const formatAmount = n => `${new Intl.NumberFormat(i18n.resolvedLanguage?.startsWith('en')?'en-GB':'fr-FR').format(n)} ${i18n.resolvedLanguage?.startsWith('en')?'XAF':'FCFA'}`;
  const switchStep = next => { setStep(next); window.scrollTo?.({top:0,behavior:'smooth'}); };
  const validated = data => {setReview(data);switchStep(3);};
  return <main className="pdc-soutenir-page">
    <nav className="pdc-soutenir-steps" aria-label={t('flow.overview',{current:step,total:3})}>
      {['appeal','form','review'].map((key,index)=><div key={key} className={`pdc-soutenir-step ${step===index+1?'is-current':''} ${step>index+1?'is-done':''}`} aria-current={step===index+1?'step':undefined}>
        <span>{index+1}</span><strong>{t(`flow.${key}`)}</strong>
      </div>)}
    </nav>
    {step===1 && <section className="pdc-soutenir-intro" aria-labelledby="titre-soutenir-pdc">
      <div className="pdc-soutenir-intro__accent" aria-hidden="true"><span/><span/></div>
      <p className="pdc-soutenir-intro__eyebrow">{t('appeal.eyebrow')}</p>
      <h1 id="titre-soutenir-pdc">{t('appeal.title')}</h1>
      <p>{t('appeal.intro')}</p>
      {!fullAppeal && <button className="pdc-soutenir-expand" type="button" aria-expanded="false" onClick={()=>setFullAppeal(true)}>{t('flow.expand')} ↓</button>}
      {fullAppeal && <div id="pdc-appel-complet">
        <p>{t('appeal.p2')}</p><p>{t('appeal.p3')}</p><p>{t('appeal.p4')}</p>
        <p className="pdc-soutenir-intro__slogan">{t('appeal.slogan')}</p>
        <button className="pdc-soutenir-expand" type="button" aria-expanded="true" aria-controls="pdc-appel-complet" onClick={()=>setFullAppeal(false)}>{t('flow.collapse')} ↑</button>
      </div>}
      <button className="pdc-soutenir-next" type="button" onClick={()=>switchStep(2)}>{t('flow.next')} →</button>
    </section>}
    {step===2 && <div className="pdc-soutenir-form-shell"><button className="pdc-soutenir-back" type="button" onClick={()=>switchStep(1)}>← {t('flow.back')}</button><p className="pdc-soutenir-draft">{t('flow.draft')}</p></div>}
    {/* Keep the form mounted when reviewing to avoid losing entered data. */}
    <div hidden={step!==2}><DonForm onValidated={validated}/></div>
    {step===3 && review && <section className="pdc-soutenir-intro pdc-soutenir-review" aria-labelledby="pdc-review-title">
      <h1 id="pdc-review-title">{t('flow.reviewTitle')}</h1>
      <dl>
        <div><dt>{t('flow.donor')}</dt><dd>{review.prenom} {review.nom}</dd></div>
        <div><dt>{t('flow.amount')}</dt><dd>{formatAmount(review.montant)}</dd></div>
        <div><dt>{t('flow.frequency')}</dt><dd>{t(review.periodicite==='mensuel'?'donation.monthly':'donation.once')}</dd></div>
        <div><dt>{t('flow.allocation')}</dt><dd>{review.affectation==='libre'?t('donation.allocationFree'):t('donation.allocationTargeted')}</dd></div>
        {review.repartition && Object.entries(review.repartition).filter(([,v])=>Number(v)>0).map(([id,v])=><div key={id}><dt>{t(`donation.posts.${id}`)}</dt><dd>{formatAmount(Number(v))}</dd></div>)}
        <div><dt>{t('flow.payment')}</dt><dd>{t(`donation.methods.${review.methode}`)}</dd></div>
        <div><dt>{t('flow.municipality')}</dt><dd>{review.commune}</dd></div>
        <div><dt>{t('flow.email')}</dt><dd>{review.email}</dd></div>
      </dl>
      {publicCheckoutSandboxEnabled()
        ? <PublicCheckoutV5C29 source="donation" data={review}
            language={i18n.resolvedLanguage?.startsWith('en')?'en':'fr'}/>
        : <><p className="pdc-soutenir-draft">{t('flow.noPayment')}</p>
           <p className="pdc-soutenir-draft">{t(review.methode==='virement'?'flow.bankPending':'flow.paymentUnavailable')}</p></>}
      <button type="button" className="pdc-soutenir-back" onClick={()=>switchStep(2)}>← {t('flow.edit')}</button>
    </section>}
  </main>;
}
