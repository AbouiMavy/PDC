-- V5-C.29 — bucket de limitation de débit DEV, rôle privé uniquement.
-- NE PAS APPLIQUER en PROD, ni avant revue des versions historiques Supabase.
-- Ce mécanisme ne dispense PAS de Turnstile ni de la supervision des abus.
BEGIN;
CREATE TABLE pdc_private.public_rate_buckets_v5c29 (
  key_digest char(64) NOT NULL CHECK (key_digest ~ '^[a-f0-9]{64}$'),
  window_started timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1 CHECK (hits BETWEEN 1 AND 100000),
  PRIMARY KEY(key_digest,window_started)
);
ALTER TABLE pdc_private.public_rate_buckets_v5c29 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.public_rate_buckets_v5c29
  FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer;

CREATE FUNCTION pdc_private.tara_v5c29_limit_public_order(p_key_digest text,p_max_hits integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_hits integer;
BEGIN
  IF p_key_digest IS NULL OR p_key_digest !~ '^[a-f0-9]{64}$' OR
     p_max_hits IS NULL OR p_max_hits NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'PDC_PUBLIC_RATE_LIMIT_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO pdc_private.public_rate_buckets_v5c29 AS rate_bucket (key_digest,window_started,hits)
  VALUES(p_key_digest,pg_catalog.date_trunc('minute',pg_catalog.now()),1)
  ON CONFLICT (key_digest,window_started) DO UPDATE
     SET hits=rate_bucket.hits+1
  RETURNING hits INTO v_hits;
  RETURN v_hits<=p_max_hits;
END;
$fn$;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c29_limit_public_order(text,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c29_limit_public_order(text,integer)
  TO pdc_tara_v5c_writer;
-- Les lignes expirées doivent être purgées par un job DBA distinct (ex. >24h).
COMMENT ON TABLE pdc_private.public_rate_buckets_v5c29 IS
  'DEV: buckets minute à clé HMAC d adresse réseau. Ni IP brute ni données personnelles en clair.';
COMMIT;
