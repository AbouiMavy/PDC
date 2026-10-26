import React, { useMemo, useRef, useState } from 'react';
import { createAdminDevClient, AdminApiError } from './client.mjs';
import { formatMinor } from './finance.mjs';
import ReviewPanel from './ReviewPanel.jsx';
import CardQueuePanel from './CardQueuePanel.jsx';

const messages = {
  fr: {
    brand: 'Parti des Démocrates Camerounais', eyebrow: 'Registre national — prototype',
    title: 'Administration nationale', subtitle: 'Accès de développement réservé aux administrateurs habilités.',
    portraitAlt: 'André-Marie Mbida, photographie d’archives du PDC, 1957', portraitDate: 'Archives PDC · 1957',
    dev: 'ENVIRONNEMENT DE TEST — AUCUNE DONNÉE RÉELLE',
    description: 'Cette interface utilise Supabase Auth et une API locale en lecture seule. Les détails des revues sont réservés aux administrateurs habilités.',
    email: 'Adresse e-mail du compte de test', password: 'Mot de passe du compte de test',
    login: 'Vérifier mon accès', loggingIn: 'Vérification…', logout: 'Fermer la session',
    deniedTitle: 'Accès non autorisé', denied: 'Le compte est authentifié, mais ne dispose d’aucune habilitation nationale active.',
    tryAgain: 'Revérifier l’habilitation', switchAccount: 'Changer de compte',
    active: 'Habilitation nationale active', summary: 'Vue nationale — indicateurs agrégés',
    pending: 'Dossiers en attente de traitement', members: 'Adhésions actives',
    refresh: 'Actualiser les indicateurs', refreshing: 'Actualisation…',
    overviewTab: 'Adhésions', financeTab: 'Finances', reviewTab: 'Revues hebdomadaires', cardsTab: 'Cartes à préparer', financeTitle: 'Synthèse financière nationale',
    initialFeeDue: 'Frais de première adhésion appelés',
    initialFeePaid: 'Frais de première adhésion confirmés',
    annualDue: 'Cotisations annuelles appelées', annualPaid: 'Cotisations annuelles confirmées',
    donationsPaid: 'Dons confirmés',
    financeNote: 'Montants issus des affectations aux paiements confirmés. Devises séparées, sans conversion. Les paiements en attente et les remboursements ne sont pas comptabilisés. Aucune fiche nominative.',
    financeEmpty: 'Valeurs à zéro : aucune opération confirmée enregistrée dans cet environnement de test.',
    empty: 'Les compteurs peuvent être à zéro tant qu’aucune donnée de test persistante n’est enregistrée.',
    future: 'Modules prévus ultérieurement', futureItems: ['Dossiers individuels (désactivé)', 'Cotisations et versements (désactivé)', 'Gestion des habilitations (désactivée)', 'Journal d’audit (désactivé)'],
    authError: 'Échec de l’authentification du compte de test.', network: 'Service temporairement indisponible. Vérifier les terminaux API (8787) et Vite (5175).',
    invalid: 'Session invalide ou expirée. Reconnectez-vous.', revoked: 'Habilitation retirée ou expirée : accès refusé.',
    config: 'Configuration incomplète : vérifier la configuration de test Supabase.',
    note: 'Pas de publication sur main / Vercel. Pas de données personnelles réelles.',
    credits: 'Photographie : Archives PDC / Wikimedia Commons (CC BY-SA 3.0) · Carte : Slomox (domaine public)',
  },
  en: {
    brand: 'Cameroonian Party of Democrats', eyebrow: 'National register — prototype',
    title: 'National administration', subtitle: 'Development access for authorized administrators only.',
    portraitAlt: 'André-Marie Mbida, PDC historical photograph, 1957', portraitDate: 'PDC archives · 1957',
    dev: 'TEST ENVIRONMENT — NO REAL PERSONAL DATA',
    description: 'This interface uses Supabase Auth and a local read-only API. Review details require national administrator authorization.',
    email: 'Test account email address', password: 'Test account password',
    login: 'Check my access', loggingIn: 'Checking…', logout: 'End session',
    deniedTitle: 'Access denied', denied: 'The account is authenticated but has no active national administrative role.',
    tryAgain: 'Recheck authorization', switchAccount: 'Use another account',
    active: 'Active national administrator role', summary: 'National overview — aggregate indicators',
    pending: 'Applications awaiting review', members: 'Active memberships',
    refresh: 'Refresh indicators', refreshing: 'Refreshing…',
    overviewTab: 'Memberships', financeTab: 'Finances', reviewTab: 'Weekly reviews', cardsTab: 'Cards to prepare', financeTitle: 'National financial overview',
    initialFeeDue: 'Initial membership fees due',
    initialFeePaid: 'Initial membership fees confirmed',
    annualDue: 'Annual dues due', annualPaid: 'Annual dues confirmed',
    donationsPaid: 'Confirmed donations',
    financeNote: 'Amounts reflect allocations to confirmed payments only. Currencies are kept separate, without conversion. Pending payments and refunds are excluded. No personal records.',
    financeEmpty: 'Zero values: no confirmed transactions recorded in this test environment.',
    empty: 'Counters may be zero until persistent test data is created.',
    future: 'Future modules', futureItems: ['Individual applications (disabled)', 'Dues and payments (disabled)', 'Role administration (disabled)', 'Audit log (disabled)'],
    authError: 'Test account authentication failed.', network: 'Service temporarily unavailable. Check the API (8787) and Vite (5175) terminals.',
    invalid: 'Session invalid or expired. Please sign in again.', revoked: 'Role revoked or expired: access denied.',
    config: 'Incomplete configuration: check Supabase development settings.',
    note: 'Not deployed to main / Vercel. No real personal data.',
    credits: 'Photograph: PDC Archives / Wikimedia Commons (CC BY-SA 3.0) · Map: Slomox (public domain)',
  },
};

function displayError(err, t) {
  if (err instanceof AdminApiError && (err.status === 401 || err.code === 'AUTH_REQUIRED')) return t.invalid;
  if (err instanceof AdminApiError && err.status === 403) return t.revoked;
  if (err instanceof AdminApiError && err.status === 400) return t.authError;
  return t.network;
}

export default function AdminDev() {
  const [lang, setLang] = useState('fr');
  const [phase, setPhase] = useState('login');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [finance, setFinance] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);
  const t = messages[lang];
  const client = useMemo(() => createAdminDevClient({
    authOrigin: __PDC_DEV_SUPABASE_URL__,
    publishableKey: __PDC_DEV_SUPABASE_PUBLISHABLE_KEY__,
  }), []);

  function reset() {
    client.clear();
    setPhase('login'); setMetrics(null); setFinance(null); setTab('overview'); setError(''); setBusy(false);
    if (passwordRef.current) passwordRef.current.value = '';
  }

  async function loadDashboard() {
    await client.request('/v1/admin/session');
    const dashboard = await client.request('/v1/admin/dashboard');
    setMetrics(dashboard); setFinance(null); setTab('overview'); setPhase('dashboard'); setError('');
  }

  async function onLogin(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const password = passwordRef.current?.value ?? '';
    if (passwordRef.current) passwordRef.current.value = '';
    try {
      await client.signIn(email.trim(), password);
      await loadDashboard();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setPhase('denied'); setError('');
      } else {
        client.clear(); setError(displayError(err, t)); setPhase('login');
      }
    } finally { setBusy(false); }
  }

  function handleAccessError(err) {
    setMetrics(null); setFinance(null);
    if (err instanceof AdminApiError && err.status === 403) {
      setPhase('denied'); setError(t.revoked);
    } else if (err instanceof AdminApiError && err.status === 401) {
      reset(); setError(t.invalid);
    } else { setError(displayError(err, t)); }
  }

  async function onFinanceTab() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await client.request('/v1/admin/session');
      const data = await client.request('/v1/admin/finance-overview');
      setFinance(data.currencies); setTab('finance');
    } catch (err) { handleAccessError(err); }
    finally { setBusy(false); }
  }

  async function onRefresh() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (phase === 'denied') {
        await loadDashboard();
      } else {
        await client.request('/v1/admin/session');
        if (tab === 'finance') {
          const data = await client.request('/v1/admin/finance-overview');
          setFinance(data.currencies);
        } else {
          const dashboard = await client.request('/v1/admin/dashboard');
          setMetrics(dashboard);
        }
      }
    } catch (err) { handleAccessError(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="pdc-admin-shell">
      <header className="pdc-admin-topbar">
        <div className="pdc-admin-brand"><span className="pdc-admin-emblem" aria-hidden="true">PDC</span><div><strong>{t.brand}</strong><small>{t.eyebrow}</small></div></div>
        <div className="pdc-admin-actions"><div className="pdc-admin-lang" aria-label="Language / Langue"><button type="button" className={lang === 'fr' ? 'selected' : ''} onClick={() => setLang('fr')}>FR</button><button type="button" className={lang === 'en' ? 'selected' : ''} onClick={() => setLang('en')}>EN</button></div>{phase !== 'login' && <button className="pdc-admin-link" type="button" onClick={reset}>{t.logout}</button>}</div>
      </header>
      <main className="pdc-admin-main">
        <div className="pdc-admin-hero">
          <div className="pdc-admin-hero-copy">
            <div className="pdc-admin-kicker">{t.eyebrow}</div>
            <h1>{t.title}</h1>
            <p className="pdc-admin-lead">{t.subtitle}</p>
            <div className="pdc-admin-sandbox" role="note">{t.dev}</div>
          </div>
          <div className="pdc-admin-heritage" aria-label="André-Marie Mbida — Cameroun">
            <img
              className="pdc-admin-heritage-map"
              src="https://upload.wikimedia.org/wikipedia/commons/e/e8/SVG-Koort_Kamerun.svg"
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
            />
            <figure className="pdc-admin-heritage-portrait">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/8/8e/Mbida_discours.jpg"
                alt={t.portraitAlt}
                referrerPolicy="no-referrer"
              />
              <figcaption><strong>André-Marie MBIDA</strong><span>{t.portraitDate}</span></figcaption>
            </figure>
          </div>
        </div>
        {phase === 'login' && <section className="pdc-admin-panel pdc-admin-login" aria-labelledby="pdc-admin-login-title">
          <h2 id="pdc-admin-login-title">{t.login}</h2>
          <p>{t.description}</p>
          <form onSubmit={onLogin}>
            <label htmlFor="pdc-admin-email">{t.email}</label>
            <input id="pdc-admin-email" name="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy}/>
            <label htmlFor="pdc-admin-password">{t.password}</label>
            <input ref={passwordRef} id="pdc-admin-password" name="password" type="password" autoComplete="current-password" required disabled={busy}/>
            {error && <p className="pdc-admin-error" role="alert">{error}</p>}
            <button className="pdc-admin-primary" type="submit" disabled={busy}>{busy ? t.loggingIn : t.login}</button>
          </form>
        </section>}
        {phase === 'denied' && <section className="pdc-admin-panel pdc-admin-login">
          <h2>{t.deniedTitle}</h2><p>{t.denied}</p>
          {error && <p className="pdc-admin-error" role="alert">{error}</p>}
          <div className="pdc-admin-buttonrow"><button type="button" className="pdc-admin-primary" onClick={onRefresh} disabled={busy}>{busy ? t.refreshing : t.tryAgain}</button><button type="button" className="pdc-admin-secondary" onClick={reset}>{t.switchAccount}</button></div>
        </section>}
        {phase === 'dashboard' && <div className="pdc-admin-dashboard">
          <div className="pdc-admin-positive" role="status">{t.active}</div>
          <div className="pdc-admin-tabs" role="tablist" aria-label={t.summary}>
            <button role="tab" type="button" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'is-active' : ''} onClick={() => {setTab('overview');setError('');}} disabled={busy}>{t.overviewTab}</button>
            <button role="tab" type="button" aria-selected={tab === 'finance'} className={tab === 'finance' ? 'is-active' : ''} onClick={onFinanceTab} disabled={busy}>{t.financeTab}</button>
            <button role="tab" type="button" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'is-active' : ''} onClick={() => { setTab('reviews'); setError(''); }} disabled={busy}>{t.reviewTab}</button>
            <button role="tab" type="button" aria-selected={tab === 'cards'} className={tab === 'cards' ? 'is-active' : ''} onClick={() => { setTab('cards'); setError(''); }} disabled={busy}>{t.cardsTab}</button>
          </div>
          {tab !== 'reviews' && tab !== 'cards' && <div className="pdc-admin-titleline"><h2>{tab === 'overview' ? t.summary : t.financeTitle}</h2><button type="button" className="pdc-admin-secondary" onClick={onRefresh} disabled={busy}>{busy ? t.refreshing : t.refresh}</button></div>}
          {error && <p className="pdc-admin-error" role="alert">{error}</p>}
          {tab === 'reviews' ? <ReviewPanel client={client} lang={lang} onAccessError={handleAccessError}/> : tab === 'cards' ? <CardQueuePanel client={client} lang={lang} onAccessError={handleAccessError}/> : tab === 'overview' ? <>
            <div className="pdc-admin-statgrid"><div className="pdc-admin-stat"><span>{t.pending}</span><strong>{metrics?.applicationsToReview ?? '–'}</strong></div><div className="pdc-admin-stat"><span>{t.members}</span><strong>{metrics?.activeMemberships ?? '–'}</strong></div></div>
            <p className="pdc-admin-hint">{t.empty}</p>
          </> : <>
            <div className="pdc-admin-finance-grid">
              {(finance || []).map(row => <section className="pdc-admin-finance-card" key={row.currency} aria-label={row.currency}>
                <h3>{row.currency === 'XAF' ? 'FCFA (XAF)' : 'Euro (EUR)'}</h3>
                {[
                  ['initialFeeDueMinor', t.initialFeeDue], ['initialFeePaidMinor', t.initialFeePaid],
                  ['annualDuesDueMinor', t.annualDue], ['annualDuesPaidMinor', t.annualPaid],
                  ['donationsConfirmedMinor', t.donationsPaid],
                ].map(([key, label]) => <div className="pdc-admin-finance-line" key={key}><span>{label}</span><strong>{formatMinor(row[key], row.currency, lang)}</strong></div>)}
              </section>)}
            </div>
            <p className="pdc-admin-hint">{t.financeNote} {(finance || []).every(r => ['initialFeeDueMinor','initialFeePaidMinor','annualDuesDueMinor','annualDuesPaidMinor','donationsConfirmedMinor'].every(k => r[k] === '0')) ? t.financeEmpty : ''}</p>
          </>}
          <section className="pdc-admin-panel"><h3>{t.future}</h3><ul className="pdc-admin-future">{t.futureItems.map(item => <li key={item}>{item}</li>)}</ul></section>
        </div>}
        <div className="pdc-admin-footnote">
          <p>{t.note}</p>
          <p className="pdc-admin-credits">{t.credits}{' · '}
            <a href="https://commons.wikimedia.org/wiki/File:Mbida_discours.jpg" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
          </p>
        </div>
      </main>
    </div>
  );
}
