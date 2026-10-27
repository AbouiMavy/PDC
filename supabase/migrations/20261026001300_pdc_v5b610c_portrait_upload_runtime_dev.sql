-- PDC V5-B.6.10-C : identifiant de connexion SEPARÉ pour le dépôt privé des portraits.
-- PROJET DE DEVELOPPEMENT UNIQUEMENT. AUCUN MOT DE PASSE EST CREE ICI.
-- Aucun endpoint HTTP ou GRANT a l'API actuelle ; jamais sur main/production.
BEGIN;
DO $create$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_portrait_upload_runtime_v5b610c') THEN
    CREATE ROLE pdc_portrait_upload_runtime_v5b610c
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      CONNECTION LIMIT 2 PASSWORD NULL;
  END IF;
END
$create$;
-- PASSWORD NULL signifie qu'aucune connexion par mot de passe n'est possible
-- tant que le responsable n'a pas configure une cle differente de celle de l'API.
GRANT USAGE ON SCHEMA pdc_private TO pdc_portrait_upload_runtime_v5b610c;
GRANT EXECUTE ON FUNCTION pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)
  TO pdc_portrait_upload_runtime_v5b610c;
GRANT EXECUTE ON FUNCTION pdc_private.portrait_confirm_v5b610b(uuid,uuid,integer,text,integer,integer)
  TO pdc_portrait_upload_runtime_v5b610c;
GRANT EXECUTE ON FUNCTION pdc_private.portrait_cancel_reservation_v5b610b(uuid,uuid)
  TO pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON ALL TABLES IN SCHEMA pdc_private FROM pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pdc_private FROM pdc_portrait_upload_runtime_v5b610c;
-- Pas de role membre / API nationale / proprietaire de table ; pas d'acces Storage SQL.
COMMENT ON ROLE pdc_portrait_upload_runtime_v5b610c IS
  'DEV; login mot de passe initialement NULL; EXECUTE de 3 fonctions reserve/confirm/cancel uniquement; jamais le role API lecteur.';
COMMIT;
