-- TEST V5-B.6.10-C : en lecture seule, aucun jeu de donnees requis.
-- Executer apres application de la migration 01300; ne cree aucune photo.
DO $test$
DECLARE r text := 'pdc_portrait_upload_runtime_v5b610c';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r AND rolcanlogin=true
          AND rolsuper=false AND rolcreatedb=false AND rolcreaterole=false
          AND rolbypassrls=false AND rolinherit=false) THEN
   RAISE EXCEPTION 'Rôle de connexion trop privilégié ou absent';
 END IF;
 RAISE NOTICE '1/7 : login technique restreint cree';
 IF NOT has_schema_privilege(r,'pdc_private','USAGE') THEN
   RAISE EXCEPTION 'Schema prive non accessible';
 END IF;
 RAISE NOTICE '2/7 : schema autorise sans droits sur les tables';
 IF NOT has_function_privilege(r,'pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)','EXECUTE') OR
    NOT has_function_privilege(r,'pdc_private.portrait_confirm_v5b610b(uuid,uuid,integer,text,integer,integer)','EXECUTE') OR
    NOT has_function_privilege(r,'pdc_private.portrait_cancel_reservation_v5b610b(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Permissions du dépôt absentes';
 END IF;
 RAISE NOTICE '3/7 : trois fonctions reserve/confirm/cancel uniquement';
 IF has_table_privilege(r,'pdc_private.people','SELECT') OR
    has_table_privilege(r,'pdc_private.card_portrait_assets','SELECT') OR
    has_table_privilege(r,'pdc_private.card_portrait_assets','INSERT') OR
    has_table_privilege(r,'pdc_private.card_portrait_assets','UPDATE') THEN
   RAISE EXCEPTION 'Acces direct aux donnees de militant ou photo';
 END IF;
 RAISE NOTICE '4/7 : aucune lecture/ecriture directe dans les tables';
 IF has_function_privilege('anon','pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)','EXECUTE') OR
    has_function_privilege('authenticated','pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Droit public d upload';
 END IF;
 RAISE NOTICE '5/7 : aucun droit attribue aux visiteurs';
 IF has_function_privilege('pdc_api_runtime_v5b3','pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Le lecteur 8787 dispose d un droit d ecriture';
 END IF;
 RAISE NOTICE '6/7 : API de consultation reste en lecture seule';
 IF EXISTS(SELECT 1 FROM pg_auth_members am
           JOIN pg_roles m ON m.oid=am.member
           WHERE m.rolname=r) THEN
   RAISE EXCEPTION 'Heritage de role inattendu';
 END IF;
 RAISE NOTICE '7/7 : aucun privilege herite d un autre role';
 RAISE NOTICE 'V5-B.6.10-C : CONTROLES DES DROITS REUSSIS';
END;
$test$;
