import React, { useEffect, useState } from 'react';
import { AdminApiError } from './client.mjs';
import './reviews.css';

const labels = {
  fr: {
    title: 'Cartes à préparer',
    intro: 'Dossiers issus de revues hebdomadaires clôturées favorablement. Lecture seule : aucune carte n’est émise ou délivrée.',
    privacy: 'Environnement de développement : données fictives uniquement. Aucune photographie n’est téléchargeable depuis cette page.',
    empty: 'Aucune demande de carte admissible dans la base de développement.',
    number: 'N° militant', name: 'Identité', origin: 'Modèle recto', format: 'Format demandé',
    portrait: 'Photo', reviewed: 'Revue clôturée',
    found: 'Référence présente (à vérifier)', missing: 'Non renseignée',
    cm: 'Cameroun', di: 'Diaspora', digital: 'Numérique', physical: 'Physique', both: 'Les deux',
    more: 'Page suivante', previous: 'Page précédente', reload: 'Actualiser', loading: 'Chargement…',
    failure: 'Chargement impossible : vérifier l’API 8787 et la dixième migration Supabase.',
    note: 'Le modèle du recto dépend de l’origine de l’adhésion. Le verso est commun. Les QR et la délivrance restent désactivés.',
  },
  en: {
    title: 'Cards to prepare',
    intro: 'Requests cleared in closed weekly reviews. Read-only: no card is issued or delivered.',
    privacy: 'Development environment: fictional data only. No photographs can be downloaded here.',
    empty: 'No eligible card requests in the development database.',
    number: 'Member number', name: 'Identity', origin: 'Front template', format: 'Requested format',
    portrait: 'Photo', reviewed: 'Review closed',
    found: 'Reference present (needs validation)', missing: 'Missing',
    cm: 'Cameroon', di: 'Diaspora', digital: 'Digital', physical: 'Physical', both: 'Both',
    more: 'Next page', previous: 'Previous page', reload: 'Refresh', loading: 'Loading…',
    failure: 'Unable to load: check API port 8787 and the tenth Supabase migration.',
    note: 'Front template depends on membership origin. Back template is shared. QR codes and delivery remain disabled.',
  },
};

function displayDate(value, language) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB');
}

export default function CardQueuePanel({ client, lang, onAccessError }) {
  const t = labels[lang] || labels.fr;
  const [cards, setCards] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function load(nextOffset = 0) {
    if (!Number.isInteger(nextOffset) || nextOffset < 0 || nextOffset > 10000 || nextOffset % 50 !== 0) return;
    setBusy(true);
    setError(false);
    try {
      const result = await client.request(`/v1/admin/cards?offset=${nextOffset}`);
      setCards(result.cards);
      setOffset(result.offset);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(true);
      setCards([]);
      setHasMore(false);
      if (err instanceof AdminApiError && [401, 403].includes(err.status)) onAccessError(err);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    client.request('/v1/admin/cards?offset=0')
      .then(result => { if (active) { setCards(result.cards); setOffset(0); setHasMore(result.hasMore); setError(false); } })
      .catch(err => { if (active) {
        setError(true); setCards([]); setHasMore(false);
        if (err instanceof AdminApiError && [401, 403].includes(err.status)) onAccessError(err);
      } });
    return () => { active = false; };
  }, [client]);

  const cardVariant = value => value === 'cameroon' ? t.cm : t.di;
  const cardFormat = value => t[value] || value;

  return <section className="pdc-admin-panel" aria-label={t.title}>
    <div className="pdc-admin-titleline">
      <h2>{t.title}</h2>
      <button className="pdc-admin-secondary" type="button" disabled={busy} onClick={() => load(offset)}>{busy ? t.loading : t.reload}</button>
    </div>
    <p>{t.intro}</p>
    <p className="pdc-admin-hint">{t.privacy}</p>
    {error && <p className="pdc-admin-error" role="alert">{t.failure}</p>}
    {!busy && cards.length === 0 && !error && <p>{t.empty}</p>}
    {cards.length > 0 && <div style={{ overflowX: 'auto' }}>
      <table className="pdc-review-table">
        <thead><tr><th>{t.number}</th><th>{t.name}</th><th>{t.origin}</th><th>{t.format}</th><th>{t.portrait}</th><th>{t.reviewed}</th></tr></thead>
        <tbody>{cards.map(item => <tr key={item.card_request_id}>
          <td>{item.member_number}</td>
          <td>{item.civility} {item.last_name} {item.first_name}</td>
          <td>{cardVariant(item.card_variant)}</td>
          <td>{cardFormat(item.requested_format)}</td>
          <td>{item.portrait_registered ? t.found : t.missing}</td>
          <td>{displayDate(item.reviewed_at, lang)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="pdc-admin-buttonrow">
      <button className="pdc-admin-secondary" type="button" disabled={busy || offset === 0} onClick={() => load(offset - 50)}>{t.previous}</button>
      <button className="pdc-admin-secondary" type="button" disabled={busy || !hasMore || offset >= 10000} onClick={() => load(offset + 50)}>{t.more}</button>
    </div>
    <p className="pdc-admin-hint">{t.note}</p>
  </section>;
}
