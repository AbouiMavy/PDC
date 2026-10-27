-- Lecture seule, a executer apres le test d'envoi. Ne montre aucune photo.
SELECT a.reference AS fictive_reference, c.id AS card_request_id,
       c.issued_at,c.delivered_at,c.status AS card_status,
       p.status AS portrait_status,p.file_bytes,p.pixel_width,p.pixel_height,
       (so.id IS NOT NULL) AS objet_present_dans_storage,
       p.object_key
FROM pdc_private.membership_applications a
JOIN pdc_private.membership_card_requests c ON c.application_id=a.id
LEFT JOIN pdc_private.card_portrait_assets p ON p.card_request_id=c.id
LEFT JOIN storage.objects so ON so.bucket_id='pdc-member-portraits-dev'
   AND so.name=p.object_key
WHERE a.reference LIKE 'TEST-V5B610D-%'
ORDER BY a.submitted_at DESC, p.created_at DESC;
