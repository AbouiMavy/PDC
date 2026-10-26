/** Barèmes transcrits des deux documents transmis, à faire confirmer avant encaissement. */
export const CAMEROUN = Object.freeze({ rural_etudiant: 5000, urbain: 12000, conseil_national: 20000, ben: 25000 });
export const DIASPORA = Object.freeze({ simple: 30, couple: 40, reduit: 15 });
export const FRAIS_INITIAUX_CM = 2000;
const entier = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim()!=='' && /^\d+$/.test(String(value)) ? Number(value) : NaN;
export function calculPremiereAdhesionCM({categorie,mode='aucun',versement='0'}) {
  const montantAnnuel = CAMEROUN[categorie];
  if (montantAnnuel === undefined) throw new Error('Catégorie camerounaise inconnue');
  let paiementCotisation = 0;
  if (mode === 'total') paiementCotisation = montantAnnuel;
  else if (mode === 'partiel') {
    paiementCotisation = entier(versement);
    if (!Number.isSafeInteger(paiementCotisation) || paiementCotisation <= 0 || paiementCotisation >= montantAnnuel) throw new Error('Le versement partiel doit être strictement compris entre zéro et la cotisation annuelle');
  } else if (mode !== 'aucun') throw new Error('Mode de cotisation inconnu');
  return Object.freeze({ devise: 'XAF', fraisAdhesion: FRAIS_INITIAUX_CM, cotisationAnnuelle: montantAnnuel, versementCotisation: paiementCotisation, resteAnnuel: montantAnnuel - paiementCotisation, totalImmediate: FRAIS_INITIAUX_CM + paiementCotisation });
}
export function calculDiaspora({ formule }) {
  const tarif = DIASPORA[formule];
  if (tarif === undefined) throw new Error('Formule diaspora inconnue');
  return Object.freeze({ devise: 'EUR', fraisAdhesion: 0, montant: tarif, totalImmediate: tarif });
}
/** Base future pour le registre central : ne comptabiliser que les encaissements confirmés. */
export function calculSoldeCotisation({annuel, versements=[]}) {
  const du = entier(annuel);
  if (!Number.isSafeInteger(du)) throw new Error('Montant annuel non valide');
  const encaisse = versements.filter(v=>v.statut==='confirme' && v.nature==='cotisation')
    .reduce((s,v)=>{const n=entier(v.montant); if(!Number.isSafeInteger(n)) throw new Error('Versement invalide');return s+n;},0);
  if (encaisse > du) throw new Error('Versements supérieurs à la cotisation : contrôle administratif nécessaire');
  return {du, encaisse, solde:du-encaisse};
}
