-- Validation purement transactionnelle du schéma; ne consomme aucun numéro nextval.
BEGIN;
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM information_schema.columns
 WHERE table_schema='pdc_private' AND table_name='people'
 AND column_name IN ('birth_place','sex_code');
 IF n <> 2 THEN RAISE EXCEPTION 'Missing identity columns'; END IF;
 IF pdc_private.format_internet_member_number('M',1) <> 'M-PDC-I-000001' THEN
  RAISE EXCEPTION 'Bad M format';
 END IF;
 IF pdc_private.format_internet_member_number('F',999999) <> 'F-PDC-I-999999' THEN
  RAISE EXCEPTION 'Bad F format';
 END IF;
 IF has_sequence_privilege('anon','pdc_private.internet_member_number_seq','USAGE') THEN
  RAISE EXCEPTION 'Anon can allocate membership sequence';
 END IF;
 IF has_table_privilege('authenticated','pdc_private.internet_number_reservations','SELECT') THEN
  RAISE EXCEPTION 'Authenticated can read reservations';
 END IF;
 IF has_table_privilege('pdc_api_runtime_v5b3','pdc_private.membership_card_requests','INSERT') THEN
  RAISE EXCEPTION 'Runtime can write card requests before implementation';
 END IF;
END;
$test$;
ROLLBACK;
