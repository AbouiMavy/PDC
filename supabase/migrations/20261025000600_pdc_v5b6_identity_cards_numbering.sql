-- V5-B.6.1 : métadonnées préparatoires, aucun paiement ni traitement réel.
-- Migration ADDITIVE pour pdc-developpement : NE REMPLACE PAS admit_member_dev.
-- La série I est distincte de la numérotation historique du PDC.
BEGIN;

-- La table people est mutualisée (adhésions/dons). L'obligation de lieu de naissance
-- sera portée par la validation d'une PREMIÈRE ADHÉSION, pas par tous les donateurs.
ALTER TABLE pdc_private.people
  ADD COLUMN birth_place text,
  ADD COLUMN sex_code char(1),
  ADD CONSTRAINT people_sex_code_v5b6 CHECK (sex_code IS NULL OR sex_code IN ('M','F')),
  ADD CONSTRAINT people_birth_place_v5b6 CHECK (birth_place IS NULL OR length(btrim(birth_place)) BETWEEN 1 AND 160);
COMMENT ON COLUMN pdc_private.people.birth_place IS 'Obligatoire pour une adhésion, non exigé pour un don; contrôle dans le service d’adhésion.';
COMMENT ON COLUMN pdc_private.people.sex_code IS 'M/F interne pour la numérotation du PDC, déterminé par la civilité Madame/Monsieur du formulaire d''adhésion.';

ALTER TABLE pdc_private.membership_applications
  ADD COLUMN card_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN card_format text,
  ADD CONSTRAINT membership_card_format_v5b6 CHECK (
    (card_requested AND card_format IS NOT NULL AND card_format IN ('digital','physical','both'))
    OR (NOT card_requested AND card_format IS NULL)
  );

-- La numérotation M/F partage un UNIQUE compteur national, 6 chiffres.
-- nextval est atomique et peut laisser des trous après rollback : NE PAS promettre une suite sans trous.
CREATE SEQUENCE pdc_private.internet_member_number_seq
  AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE;
REVOKE ALL ON SEQUENCE pdc_private.internet_member_number_seq FROM PUBLIC, anon, authenticated, service_role, pdc_api_v5b3, pdc_api_runtime_v5b3;

-- Préparation de la réservation durable : pas de réattribution même après révocation.
-- L'attribution transactionnelle au membre sera développée en V5-B.6.2.
CREATE TABLE pdc_private.internet_number_reservations (
  serial_number integer PRIMARY KEY CHECK (serial_number BETWEEN 1 AND 999999),
  member_number text NOT NULL UNIQUE CHECK (member_number ~ '^[MF]-PDC-I-[0-9]{6}$'),
  person_id uuid NOT NULL UNIQUE REFERENCES pdc_private.people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pg_catalog.right(member_number,6) = pg_catalog.lpad(serial_number::text,6,'0'))
);
CREATE TABLE pdc_private.membership_card_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES pdc_private.membership_applications(id),
  person_id uuid NOT NULL REFERENCES pdc_private.people(id),
  requested_format text NOT NULL CHECK (requested_format IN ('digital','physical','both')),
  portrait_storage_key text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reviewed','issued','delivered','invalidated')),
  issued_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id,person_id),
  CHECK (delivered_at IS NULL OR issued_at IS NOT NULL)
);
-- Le lien partenaire/demande de couple sera géré lors de l'intégration du backend.
-- Les photographies ne sont pas stockées dans cette table, seulement une clé privée future.

ALTER TABLE pdc_private.internet_number_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdc_private.membership_card_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pdc_private.internet_number_reservations FROM PUBLIC, anon, authenticated, service_role, pdc_api_v5b3, pdc_api_runtime_v5b3;
REVOKE ALL ON pdc_private.membership_card_requests FROM PUBLIC, anon, authenticated, service_role, pdc_api_v5b3, pdc_api_runtime_v5b3;

-- Helper de format uniquement; PAS un mécanisme d'attribution de numéro.
CREATE FUNCTION pdc_private.format_internet_member_number(p_sex text,p_serial integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $fn$
BEGIN
 IF p_sex NOT IN ('M','F') OR p_sex IS NULL
    OR p_serial IS NULL OR p_serial NOT BETWEEN 1 AND 999999 THEN
  RAISE EXCEPTION 'PDC_INVALID_INTERNET_NUMBER';
 END IF;
 RETURN p_sex || '-PDC-I-' || pg_catalog.lpad(p_serial::text,6,'0');
END;
$fn$;
REVOKE ALL ON FUNCTION pdc_private.format_internet_member_number(text,integer)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
COMMIT;
