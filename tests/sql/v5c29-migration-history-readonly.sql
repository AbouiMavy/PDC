-- DIAGNOSTIC LECTURE SEULE — NE MODIFIE PAS supabase_migrations.
-- 022 peut ne pas être appliquée (réservée aux membres authentifiés).
SELECT v.version,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations h WHERE h.version=v.version) AS registered_in_history,
  CASE v.version
    WHEN '20261028002200' THEN to_regprocedure('pdc_private.tara_v5c_authorized_checkout(uuid,uuid)') IS NOT NULL
    WHEN '20261028002300' THEN to_regprocedure('pdc_private.tara_v5c_create_public_order(jsonb)') IS NOT NULL
    WHEN '20261028002700' THEN to_regprocedure('pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text)') IS NOT NULL
    WHEN '20261028002900' THEN to_regprocedure('pdc_private.tara_v5c29_limit_public_order(text,integer)') IS NOT NULL
  END AS corresponding_function_present
FROM (VALUES ('20261028002200'),('20261028002300'),('20261028002700'),('20261028002900')) AS v(version)
ORDER BY v.version;
-- Ne jamais insérer manuellement dans schema_migrations sur simple présence d'une fonction.
