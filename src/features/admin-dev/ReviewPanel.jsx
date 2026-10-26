import React, {useEffect, useState} from 'react';
import {AdminApiError} from './client.mjs';
import './reviews.css';

const labels = {
  fr: {
    heading:'Revues hebdomadaires', intro:'Consultation des lots contrôlés ou ouverts. Aucune décision ne peut être prise depuis cette version.',
    empty:'Aucun lot enregistré dans la base de développement.', choose:'Voir les membres', status:'État', date:'Ouverture',
    total:'Effectif', cleared:'Contrôlés', revoked:'Révoqués', number:'Numéro', name:'Identité', birth:'Naissance',
    country:'Pays', card:'Carte demandée', outcome:'Contrôle', yes:'Oui', no:'Non', more:'Page suivante', previous:'Page précédente',
    noMembers:'Aucun membre pour cette page.', reload:'Actualiser', loading:'Chargement…',
    backend:'Erreur de chargement. Vérifier le port API 8787 et l’habilitation nationale.',
    private:'Informations nominatives de test réservées aux administrateurs nationaux. Ne pas y saisir de données réelles.',
    sql:'Révocations et clôtures : SQL Editor uniquement dans cette itération. Aucune impression ni délivrance de cartes.',
    open:'Ouverte', closed:'Clôturée', pending:'À contrôler', clearedStatus:'Contrôlé', revokedStatus:'Révoqué',
  },
  en: {
    heading:'Weekly reviews', intro:'Read-only view of open and completed batches. This version cannot make decisions.',
    empty:'No batches in the development database.', choose:'View members', status:'Status', date:'Opened',
    total:'Members', cleared:'Cleared', revoked:'Revoked', number:'Number', name:'Identity', birth:'Birth',
    country:'Country', card:'Card requested', outcome:'Review', yes:'Yes', no:'No', more:'Next page', previous:'Previous page',
    noMembers:'No members on this page.', reload:'Refresh', loading:'Loading…',
    backend:'Unable to load reviews. Check API port 8787 and your national administrator role.',
    private:'Sensitive test-only member details, limited to national administrators. Do not use real member data.',
    sql:'Revocations and closing batches: SQL Editor only in this iteration. No card issuance or delivery.',
    open:'Open', closed:'Closed', pending:'Pending', clearedStatus:'Cleared', revokedStatus:'Revoked',
  },
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function date(s,lang) {
  if (typeof s !== 'string') return '—';
  const d=new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang==='fr'?'fr-FR':'en-GB');
}

export default function ReviewPanel({client,lang,onAccessError}) {
  const t=labels[lang]||labels.fr;
  const [batches,setBatches]=useState([]);
  const [selected,setSelected]=useState(null);
  const [members,setMembers]=useState([]);
  const [offset,setOffset]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);

  async function loadBatches() {
    setBusy(true);setError(false);
    try {
      const data=await client.request('/v1/admin/reviews');
      setBatches(data.batches);
    } catch(e) { setError(true); setBatches([]); setSelected(null); setMembers([]);
      if (e instanceof AdminApiError && [401,403].includes(e.status)) onAccessError(e);
    } finally {setBusy(false);}
  }
  useEffect(()=>{let active=true;
    client.request('/v1/admin/reviews').then(data=>{if(active){setBatches(data.batches);setError(false);}})
      .catch(e=>{if(active){setError(true);if(e instanceof AdminApiError && [401,403].includes(e.status))onAccessError(e);}});
    return ()=>{active=false;};
  },[client]); // session change remounts with dashboard

  async function loadMembers(batchId,newOffset=0) {
    if(!uuid.test(batchId)||newOffset<0||newOffset>10000||newOffset%50!==0) return;
    setBusy(true);setError(false);
    try {
      const data=await client.request(`/v1/admin/reviews/${batchId}?offset=${newOffset}`);
      setSelected(batchId);setMembers(data.members);setOffset(newOffset);setHasMore(data.hasMore);
    } catch(e) {setError(true);setMembers([]);
      if(e instanceof AdminApiError && [401,403].includes(e.status))onAccessError(e);
    } finally {setBusy(false);}
  }
  const o=x=> x==='open'?t.open:x==='closed'?t.closed:x||'—';
  const outcome=x=>x==='pending'?t.pending:x==='cleared'?t.clearedStatus:x==='revoked'?t.revokedStatus:x||'—';
  return <section className="pdc-admin-panel" aria-label={t.heading}>
    <div className="pdc-admin-titleline"><h2>{t.heading}</h2>
      <button className="pdc-admin-secondary" type="button" disabled={busy} onClick={loadBatches}>{busy?t.loading:t.reload}</button></div>
    <p>{t.intro}</p><p className="pdc-admin-hint">{t.private}</p>
    {error&&<p className="pdc-admin-error" role="alert">{t.backend}</p>}
    {!busy&&batches.length===0&&!error&&<p>{t.empty}</p>}
    {batches.length>0&&<div style={{overflowX:'auto'}}><table className="pdc-review-table"><thead><tr>
      <th>{t.date}</th><th>{t.status}</th><th>{t.total}</th><th>{t.cleared}</th><th>{t.revoked}</th><th></th>
    </tr></thead><tbody>{batches.map(b=><tr key={b.batch_id}>
      <td>{date(b.opened_at,lang)}</td><td>{o(b.status)}</td><td>{b.members_in_batch}</td><td>{b.members_cleared}</td><td>{b.members_revoked}</td>
      <td><button className="pdc-admin-secondary" type="button" disabled={busy} onClick={()=>loadMembers(b.batch_id)}>{t.choose}</button></td>
    </tr>)}</tbody></table></div>}
    {selected&&<section aria-label={t.name}>
      <h3>{t.name} — {selected.slice(0,8)}</h3>
      <div style={{overflowX:'auto'}}><table className="pdc-review-table"><thead><tr>
        <th>{t.number}</th><th>{t.name}</th><th>{t.birth}</th><th>{t.country}</th><th>{t.card}</th><th>{t.outcome}</th>
      </tr></thead><tbody>{members.map(m=><tr key={m.membership_id}>
        <td>{m.member_number}</td><td>{m.civility} {m.last_name} {m.first_name}</td>
        <td>{m.date_of_birth||'—'} · {m.birth_place||'—'}</td><td>{m.country_code}</td>
        <td>{m.card_requested?t.yes:t.no}{m.card_requested&&m.card_format?` (${m.card_format})`:''}</td><td>{outcome(m.outcome)}</td>
      </tr>)}</tbody></table></div>
      {!busy&&members.length===0&&!error&&<p>{t.noMembers}</p>}
      <div className="pdc-admin-buttonrow">
        <button type="button" className="pdc-admin-secondary" disabled={busy||offset===0} onClick={()=>loadMembers(selected,offset-50)}>{t.previous}</button>
        <button type="button" className="pdc-admin-secondary" disabled={busy||!hasMore||offset>=10000} onClick={()=>loadMembers(selected,offset+50)}>{t.more}</button>
      </div>
    </section>}
    <p className="pdc-admin-hint">{t.sql}</p>
  </section>;
}
