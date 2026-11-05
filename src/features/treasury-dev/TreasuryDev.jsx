import React, { useEffect, useRef, useState } from 'react';
import './TreasuryDev.css';
import './TreasuryIdentityT11.css';

const API = '/__pdc_admin_api';
const categories = {
  adhesion_diaspora: 'Adhésion diaspora', adhesion_cameroun: 'Adhésion Cameroun',
  don: 'Don', cotisation_annuelle: 'Cotisation annuelle', historique_a_qualifier: 'Historique à qualifier',
};
const statuses = { initiated: 'Initié', pending: 'En attente', confirmed: 'Confirmé', failed: 'Échoué', cancelled: 'Annulé' };
const formatXaf = value => /^\d+$/.test(String(value ?? '')) ? `${BigInt(value).toLocaleString('fr-FR')} FCFA` : '—';
const formatEur = cents => /^\d+$/.test(String(cents ?? '')) ? `${(Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—';
const formatDecimalXaf = value => value != null && /^\d+(?:\.\d+)?$/.test(String(value)) ? `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA` : '—';
const formatDate = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('fr-FR') : '—';
const text = value => value == null || value === '' ? '—' : String(value);

function apiError(response, body) {
  const error = new Error(body?.error || 'SERVICE_INDISPONIBLE');
  error.status = response.status;
  return error;
}

export default function TreasuryDev() {
  const [email, setEmail] = useState('');
  const password = useRef(null);
  const token = useRef(null);
  const requestSeq = useRef(0);
  const [phase, setPhase] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '', search: '' });
  const [applied, setApplied] = useState({ category: '', status: '', search: '' });
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const pageSize = 25;
  const authOrigin = import.meta.env.VITE_PDC_DEV_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_PDC_DEV_SUPABASE_PUBLISHABLE_KEY;

  async function decode(response) {
    let body;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) throw apiError(response, body);
    return body;
  }
  async function request(path, bearer = token.current) {
    if (!bearer) throw new Error('SESSION_ABSENTE');
    return decode(await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      method: 'GET', cache: 'no-store', redirect: 'error',
    }));
  }
  function logout() {
    requestSeq.current++;
    token.current = null;
    if (password.current) password.current.value = '';
    setResult(null); setSelected(null); setError(''); setPhase('login');
  }
  async function login(event) {
    event.preventDefault();
    if (busy) return;
    const secret = password.current?.value || '';
    if (password.current) password.current.value = '';
    setBusy(true); setError('');
    try {
      if (!authOrigin || !publishableKey || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(authOrigin)) throw new Error('CONFIGURATION_DEV_ABSENTE');
      const response = await fetch(`${authOrigin.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: secret }), cache: 'no-store', redirect: 'error',
      });
      const session = await decode(response);
      if (typeof session.access_token !== 'string') throw new Error('SESSION_INVALIDE');
      token.current = session.access_token;
      await request('/v1/treasury/session');
      setPhase('register');
    } catch (e) {
      token.current = null;
      setError(e.status === 403 ? 'Accès refusé : habilitation de trésorier national requise.' : `Connexion impossible : ${e.message}`);
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (phase !== 'register') return;
    const seq = ++requestSeq.current;
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    for (const [key, value] of Object.entries(applied)) if (value) params.set(key, value);
    setBusy(true); setError(''); setSelected(null);
    request(`/v1/treasury/register?${params.toString()}`)
      .then(data => {
        if (seq !== requestSeq.current) return;
        if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error('FORMAT_REGISTRE_INVALIDE');
        setResult(data);
      })
      .catch(e => {
        if (seq !== requestSeq.current) return;
        setResult(null);
        if (e.status === 401 || e.status === 403) {
          token.current = null; setPhase('login');
        }
        setError(e.status === 403 ? 'Habilitation révoquée ou expirée.' : `Registre indisponible : ${e.message}`);
      })
      .finally(() => { if (seq === requestSeq.current) setBusy(false); });
  }, [phase, offset, applied]);
  function applyFilters(e) {
    e.preventDefault();
    const search = filters.search.trim();
    if (search && !/^[A-Za-z0-9_-]{1,120}$/.test(search)) {
      setError('Recherche : caractères autorisés A–Z, 0–9, _ et - (120 maximum).'); return;
    }
    setOffset(0); setApplied({ ...filters, search });
  }
  const items = result?.items ?? [];
  const stats = result?.statistics;
  const statusCounts = stats?.statusCounts;
  const statusTotal = statusCounts ? Object.values(statuses).reduce((n, _label, index) => n + Number(statusCounts[Object.keys(statuses)[index]] || 0), 0) : 0;
  const statusColors = { initiated: '#d7a528', pending: '#edc961', confirmed: '#117e4b', failed: '#bf5550', cancelled: '#87948b' };
  let angle = 0;
  const gradient = Object.keys(statuses).map(key => {
    const start = angle;
    angle += statusTotal ? Number(statusCounts?.[key] || 0) / statusTotal * 100 : 0;
    return `${statusColors[key]} ${start}% ${angle}%`;
  }).join(', ');
  return <div className="pdc-treasury">
    <header className="pdc-treasury-header">
      <div><div className="pdc-treasury-eyebrow">PDC · FINANCES NATIONALES</div><h1>Registre de trésorerie</h1><p>Suivi des liens TaraMoney émis · Rapprochement exclusivement manuel</p></div>
      <div className="pdc-treasury-header-actions"><div className="pdc-treasury-official-logo">
      <img src="/logoPDC.png" alt="Logo officiel du PDC" />
    </div>
    <span className="pdc-treasury-dev">DEV · LECTURE SEULE</span>{phase === 'register' && <button type="button" onClick={logout}>Déconnexion</button>}</div>
    </header>
    {phase === 'login' ? <main className="pdc-treasury-login">
      <h2>Accès du trésorier national</h2><p>Authentification Supabase. Aucun mot de passe ni jeton n'est enregistré dans le navigateur.</p>
      <form onSubmit={login}><label>Adresse e-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
        <label>Mot de passe<input type="password" autoComplete="current-password" ref={password} required disabled={busy}/></label>
        <button type="submit" disabled={busy}>{busy ? 'Vérification…' : 'Se connecter'}</button></form>
      {error && <p role="alert" className="pdc-treasury-error">{error}</p>}
    </main> : <main className="pdc-treasury-main">
      <div className="pdc-treasury-summary">
        {[
          ['Opérations filtrées', stats?.count ?? result?.total ?? '—'],
          ['Total émis', stats ? formatXaf(stats.issuedXaf) : '—'],
          ['Paiements confirmés (brut)', stats ? formatXaf(stats.confirmedXaf) : '—'],
          ['Minimum', stats ? formatXaf(stats.minimumXaf) : '—'],
          ['Moyenne', stats ? formatDecimalXaf(stats.averageXaf) : '—'],
          ['Médiane', stats ? formatDecimalXaf(stats.medianXaf) : '—'],
          ['Maximum', stats ? formatXaf(stats.maximumXaf) : '—'],
          ['Lignes sur cette page', `${items.length} / ${result?.total ?? '—'}`],
        ].map(([label, value]) => <section key={label}><span>{label}</span><strong>{value}</strong></section>)}
      </div>
      <section className="pdc-treasury-chart" aria-label="Répartition des paiements par statut">
        <div><h2>Répartition des états de paiement</h2><p>Ensemble des opérations filtrées, indépendamment de la pagination.</p></div>
        {statusCounts ? <div className="pdc-treasury-chart-body">
          <div className="pdc-treasury-donut" role="img" aria-label={`${statusTotal} opérations réparties par état`} style={{ background: statusTotal ? `conic-gradient(${gradient})` : '#e6ece6' }}><span>{statusTotal}<small>opérations</small></span></div>
          <ul className="pdc-treasury-legend">{Object.entries(statuses).map(([key, label]) => <li key={key}><i style={{ background: statusColors[key] }} />{label}<strong>{Number(statusCounts[key] || 0)} ({statusTotal ? (100 * Number(statusCounts[key] || 0) / statusTotal).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '0'} %)</strong></li>)}</ul>
        </div> : <p>Statistiques indisponibles jusqu'à l'installation de la fonction SQL V5C44-T3 en DEV.</p>}
      </section>
      <form className="pdc-treasury-filters" onSubmit={applyFilters}>
        <label>Nature de l'opération<select value={filters.category} onChange={e => setFilters(s => ({ ...s, category: e.target.value }))}><option value="">Toutes</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>État du paiement<select value={filters.status} onChange={e => setFilters(s => ({ ...s, status: e.target.value }))}><option value="">Tous</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>ProductId / identifiant<input value={filters.search} maxLength={120} onChange={e => setFilters(s => ({ ...s, search: e.target.value }))} placeholder="Rechercher un identifiant"/></label>
        <button type="submit" disabled={busy}>Filtrer</button>
        <button type="button" className="pdc-treasury-secondary" onClick={() => { const blank = { category: '', status: '', search: '' }; setFilters(blank); setOffset(0); setApplied(blank); }} disabled={busy}>Réinitialiser</button>
      </form>
      {error && <p role="alert" className="pdc-treasury-error">{error}</p>}
      <div className="pdc-treasury-tablewrap"><table><thead><tr><th>Émission</th><th>Référence TaraMoney</th><th>Catégorie</th><th>État</th><th>Montant attendu</th><th>Transaction</th><th>Consultation</th></tr></thead><tbody>
        {items.map((item, i) => <tr key={`${item.productId || i}-${item.paymentId || i}`}><td>{formatDate(item.createdAt)}</td><td className="pdc-treasury-code">{text(item.productId)}</td><td>{categories[item.category] || 'À qualifier'}{item.category === 'don' && item.paymentStatus === 'confirmed' && Number(item.donationCount) > 0 && <small>Don qualifié · affectation enregistrée</small>}</td><td><span className={`pdc-treasury-status pdc-treasury-status-${item.paymentStatus}`}>{statuses[item.paymentStatus] || text(item.paymentStatus)}</span></td><td className="pdc-treasury-amount">{formatXaf(item.expectedGrossXaf)}{item.legalAmountEurCents != null && <small>Origine : {formatEur(item.legalAmountEurCents)}</small>}</td><td className="pdc-treasury-code">{text(item.providerTransactionId)}</td><td><button type="button" className="pdc-treasury-secondary" onClick={() => setSelected(item)}>Détails</button></td></tr>)}
        {!busy && items.length === 0 && <tr><td colSpan="7" className="pdc-treasury-empty">Aucune intention correspondant aux critères, ou registre non encore disponible.</td></tr>}
      </tbody></table></div>
      <nav className="pdc-treasury-pagination" aria-label="Pagination"><button type="button" disabled={busy || offset === 0} onClick={() => setOffset(v => Math.max(0, v - pageSize))}>Précédent</button><span>Page {Math.floor(offset / pageSize) + 1}</span><button type="button" disabled={busy || !result || offset + pageSize >= result.total} onClick={() => setOffset(v => v + pageSize)}>Suivant</button></nav>
      <p className="pdc-treasury-warning">Le total émis représente les intentions, et non les encaissements. Le total confirmé est brut, avant frais. Les qualifications et affectations déjà enregistrées sont conservées ; aucune nouvelle qualification n'est effectuée par ce tableau.</p>
      {selected && <section className="pdc-treasury-detail pdc-treasury-identity" aria-label="Identité du contributeur" data-treasury-identity-version="T9" data-treasury-presentation-version="T11">
        <div className="pdc-treasury-detailhead pdc-treasury-identity-header">
          <span className="pdc-treasury-identity-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span>
          <h2>Identité et coordonnées du contributeur</h2>
        </div>
        <div className="pdc-treasury-identity-grid">
        <section className="pdc-treasury-identity-card pdc-treasury-identity-card--contact" aria-labelledby="pdc-treasury-contact-title">
        <h3 id="pdc-treasury-contact-title"><span className="pdc-treasury-identity-step" aria-hidden="true">01</span><span>Identité et contact</span></h3>
        <dl>
          {[
            ['Civilité', selected.contributor?.civility],
            ['Nom', selected.contributor?.lastName],
            ['Prénom', selected.contributor?.firstName],
            ['Téléphone', selected.contributor?.phone],
            ['E-mail', selected.contributor?.email],
          ].map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{text(value)}</dd></React.Fragment>)}
        </dl>
        </section>
        <section className="pdc-treasury-identity-card pdc-treasury-identity-card--residence" aria-labelledby="pdc-treasury-residence-title">
        <h3 id="pdc-treasury-residence-title"><span className="pdc-treasury-identity-step" aria-hidden="true">02</span><span>Résidence effective</span></h3>
        <p>Adresse de résidence déclarée, en France, au Cameroun ou dans un autre pays.</p>
        {selected.contributor?.residenceDataQuality==='not_collected_historic' &&
          <p role="status">Dossier diaspora historique : l'adresse de résidence étrangère n'a pas été recueillie. Les anciennes valeurs camerounaises ne sont pas affichées comme une résidence.</p>}
        <dl>
          {[
            ['Pays de résidence', selected.contributor?.country],
            ['Ville de résidence', selected.contributor?.city],
            ['Région / province / État de résidence', selected.contributor?.region],
            ['Département / division de résidence', selected.contributor?.department],
            ['Code postal', selected.contributor?.postalCode],
          ].map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{text(value)}</dd></React.Fragment>)}
        </dl>
        </section>
        <section className="pdc-treasury-identity-card pdc-treasury-identity-card--territory" aria-labelledby="pdc-treasury-territory-title">
        <h3 id="pdc-treasury-territory-title"><span className="pdc-treasury-identity-step" aria-hidden="true">03</span><span>Rattachement territorial au Cameroun</span></h3>
        <p>Région, département et commune de rattachement déclarés : ces informations ne sont pas une adresse de résidence.</p>
        {selected.contributor?.homeTerritorySource==='r5_historical_snapshot' &&
          <p role="status">Rattachement récupéré depuis le dossier diaspora d'origine, sans modifier l'identité historique.</p>}
        <dl>
          {[
            ['Région de rattachement', selected.contributor?.homeRegion],
            ['Département de rattachement', selected.contributor?.homeDepartment],
            ['Commune de rattachement', selected.contributor?.homeCommune],
          ].map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{text(value)}</dd></React.Fragment>)}
          {selected.donor && [selected.donor.firstName, selected.donor.lastName].filter(Boolean).join(' ').trim() !== [selected.contributor?.firstName, selected.contributor?.lastName].filter(Boolean).join(' ').trim() && <React.Fragment><dt>Donateur affecté distinct du payeur</dt><dd>{[selected.donor.firstName, selected.donor.lastName].filter(Boolean).join(' ') || 'Non renseigné'}</dd></React.Fragment>}
        </dl>
        </section>
        </div>
      </section>}
      {selected && <section className="pdc-treasury-detail" aria-label="Détail de l'intention"><div className="pdc-treasury-detailhead"><h2>Détail financier</h2><button type="button" onClick={() => setSelected(null)}>Fermer</button></div><dl>
        {[['ProductId',selected.productId],['Identifiant paiement',selected.paymentId],['Identifiant commande',selected.quoteId],['Nature',categories[selected.category] || 'À qualifier'],['État du paiement',statuses[selected.paymentStatus] || selected.paymentStatus],['Montant attendu',formatXaf(selected.expectedGrossXaf)],['Montant affecté',formatXaf(selected.allocatedXaf)],['Transaction marchande',selected.providerTransactionId],['Date de confirmation',formatDate(selected.confirmedAt)],['Formule diaspora',selected.diasporaFormula],['Montant légal diaspora',formatEur(selected.legalAmountEurCents)],['Nombre d’affectations',selected.allocationCount],['Qualification comptable', selected.category === 'don' && selected.paymentStatus === 'confirmed' && Number(selected.donationCount) > 0 ? 'Don qualifié · affectation enregistrée' : 'Non établie par le registre']].map(([key,value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{text(value)}</dd></React.Fragment>)}
      </dl><p>Montants observés, frais, net encaissé et justificatifs : consultation détaillée à raccorder après validation de la passerelle SQL. Aucune confirmation n'est possible depuis cette version.</p></section>}
    </main>}
    <footer>Parti des Démocrates Camerounais · Trésorerie nationale · Environnement de développement</footer>
  </div>;
}
