/** Calculs purs pour la V5-B. Pas de données réelles, pas de réseau, pas de secret.
 * Montants en unités entières (FCFA ou centimes d'euro selon la devise).
 * Toute règle doit être répétée / validée par le futur backend. */
export function enUnitesMineures(montant, devise){
  // '30' EUR -> 3000 cents; '5000' XAF -> 5000 FCFA.
  if(typeof montant !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(montant)) throw new Error('Montant decimal invalide');
  if(devise==='XAF') {
    if(!/^\d+$/.test(montant)) throw new Error('Le XAF doit etre entier');
    const v=Number(montant);if(!Number.isSafeInteger(v)||v<=0)throw new Error('Montant XAF invalide');
    return v;
  }
  if(devise==='EUR') {
    const [whole,decimal=''] = montant.split('.');
    const v=Number(whole)*100+Number(decimal.padEnd(2,'0'));
    if(!Number.isSafeInteger(v)||v<=0) throw new Error('Montant EUR invalide');
    return v;
  }
  throw new Error('Devise inconnue');
}
const entierPositif = (x, label) => {
  if (!Number.isSafeInteger(x) || x <= 0) throw new Error(`${label} doit être un entier positif`);
  return x;
};
export function calculSoldeParVersements({montantDu, devise, operations = []}) {
  entierPositif(montantDu, 'Montant dû');
  if(!['XAF','EUR'].includes(devise)) throw new Error('Devise non prise en charge');
  const refs = new Set(); let paye = 0;
  for (const operation of operations) {
    if(!operation.id || refs.has(operation.id)) throw new Error('Identifiant de transaction absent ou dupliqué');
    refs.add(operation.id);
    entierPositif(operation.montant, 'Versement');
    if(operation.devise !== devise) throw new Error('Incohérence de devise');
    if(!['initie','en_attente','confirme','echec','annule','rembourse'].includes(operation.statut)) throw new Error('Statut inconnu');
    if(operation.statut === 'confirme') paye += operation.montant;
    if(!Number.isSafeInteger(paye)) throw new Error('Dépassement numérique');
  }
  if(paye>montantDu) throw new Error('Trop-perçu : rapprochement administratif nécessaire');
  return Object.freeze({montantDu,devise,paye,solde:montantDu-paye,soldeRegle:paye===montantDu});
}
export function calculPremiereCotisation({categorie, mode='aucun', partiel=0}) {
  const TARIFS = {rural_etudiant:5000,urbain:12000,conseil_national:20000,ben:25000};
  const annuel = TARIFS[categorie];
  if(!annuel) throw new Error('Catégorie inconnue');
  const cotisation = mode==='aucun' ? 0 : mode==='total' ? annuel : mode==='partiel' ? partiel : NaN;
  if(!Number.isSafeInteger(cotisation) || cotisation<0 || cotisation>annuel) throw new Error('Versement annuel incorrect');
  if(mode==='partiel' && (cotisation===0 || cotisation===annuel)) throw new Error('Le versement partiel doit être strictement partiel');
  return Object.freeze({devise:'XAF',fraisInitiaux:2000,cotisationAnnuelle:annuel,versementCotisation:cotisation,total:2000+cotisation,soldeAnnuel:annuel-cotisation});
}
export function montantReparti({paiement, parts}) {
  entierPositif(paiement, 'Paiement');
  if(!Array.isArray(parts) || parts.length===0) throw new Error('Affectation manquante');
  let total=0;
  for(const part of parts){
    entierPositif(part.montant,'Affectation');total+=part.montant;
    if(!['frais_adhesion','cotisation','don'].includes(part.type)) throw new Error('Destination non valide');
  }
  if(total!==paiement) throw new Error('Affectations différentes du paiement');
  return total;
}
