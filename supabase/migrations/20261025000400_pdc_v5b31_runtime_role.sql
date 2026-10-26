-- PDC V5-B.3.1 — Création du rôle de connexion technique de développement.
-- Les fonctions et le groupe d'autorisations proviennent de la migration V5-B.3.
-- Pas de mot de passe dans Git, les migrations, les journaux SQL ou l'API React.
-- Sans mot de passe, la connexion distante par authentification par mot de passe reste impossible.
BEGIN;

-- Échec volontaire si le rôle existe déjà : empêcher la reprise silencieuse d'un rôle inconnu.
CREATE ROLE pdc_api_runtime_v5b3
  LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  CONNECTION LIMIT 3 PASSWORD NULL;

-- Le compte n'hérite que des privilèges explicitement attribués au groupe en V5-B.3.
GRANT pdc_api_v5b3 TO pdc_api_runtime_v5b3;

-- Mesures supplémentaires de confinement ; ces REVOKE n'annulent pas les privilèges
-- accordés implicitement à PUBLIC (contrôlés par les tests SQL).
REVOKE ALL ON ALL TABLES IN SCHEMA pdc_private FROM pdc_api_runtime_v5b3;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pdc_private FROM pdc_api_runtime_v5b3;

COMMIT;
