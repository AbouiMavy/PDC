# Pack consolidé PDC V5-C.44.4-R2 (avec contrôle V5-C.44.5)

Un installateur shell autonome embarque les fichiers. Il vérifie `feature/v5c44`, refuse les fichiers cibles modifiés et les changements Git déjà indexés, puis lance les tests, `npm run build`, commit et push. Il n'applique **aucune** migration SQL et n'exécute **aucune** opération TaraMoney.

Mode nouveau : aucun fichier V5-C.44.4 n'a encore été installé.

Mode reprise : les fichiers V5-C.44.4 du paquet précédent sont présents **tels quels** ; le script les met à jour puis ajoute les fichiers 44.5. Une installation partielle ou personnalisée est refusée pour éviter d'écraser des corrections locales.

Après installation du code, consulter `docs/V5C44_LOT45_BRUT_NET_MANUEL.md`, puis faire relire et exécuter séparément les deux migrations dans Supabase DEV en contrôlant lesquelles ont déjà été appliquées.
