/** Convention interne V5-B.6.5 : le préfixe officiel M/F est calculé à partir de
 * la civilité déclarée sur le formulaire. Aucun champ « Sexe » côté utilisateur.
 * Cette fonction ne constitue PAS une vérification d'identité.
 * SQL V5-B.6.2 applique les mêmes règles Madame -> F, Monsieur -> M.
 */
const PREFIXES = Object.freeze({ Madame: 'F', Monsieur: 'M' });

export function prefixForCivilite(civilite) {
  return Object.hasOwn(PREFIXES, civilite) ? PREFIXES[civilite] : null;
}

export function prefixesPourAdhesion({ civilite, formule, civilitePartenaire }) {
  const principal = prefixForCivilite(civilite);
  if (!principal) throw new TypeError('Civilité du demandeur obligatoire');
  if (formule !== 'couple') return [principal];
  const partenaire = prefixForCivilite(civilitePartenaire);
  if (!partenaire) throw new TypeError('Civilité de la deuxième personne obligatoire');
  return [principal, partenaire];
}
