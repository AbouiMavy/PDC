#!/usr/bin/env python3
"""Patch idempotent: six sections FR/EN d'adhésion, grille de paiement partagée."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
path=root/'src/pages/Adhesion.jsx'
shared=root/'src/components/PaymentMethods/PaymentMethods.jsx'
assert path.is_file() and shared.is_file(), 'Installer après le lot paiement commun Adhérer/Soutenir.'
ad=path.read_text(encoding='utf8')
pm=shared.read_text(encoding='utf8')
if 'titlePrefix="5. "' in ad:
    assert "titlePrefix = ''" in pm
    print('SIX_RUBRIQUES_DEJA_APPLIQUEES'); raise SystemExit(0)
repl=[
 ('<fieldset><legend>{t.type}</legend>', '<h2>1. {t.type.replace(/\\s*\\*\\s*$/, \'\')}</h2>\n        <fieldset><legend>{t.type}</legend>'),
 ('{!isNew ? <div className="pdc-adhesion-panel">', '{!isNew ? <div className="pdc-adhesion-panel">\n          <h2>2. {t.personal}</h2>'),
 ('<h2>{t.personal}</h2>', '<h2>2. {t.personal}</h2>'),
 ('<h2>{t.annual}</h2>', '<h2>3. {t.annual}</h2>'),
 ('<h2>{t.cardSection}</h2>', '<h2>4. {t.cardSection}</h2>'),
 ('<h2>{t.memberStatements}</h2>', '<h2>6. {t.memberStatements}</h2>'),
 ('messagerie={messagerie} onMessagerieChange={setMessagerie} titleId="pdc-adhesion-paiement"/>', 'messagerie={messagerie} onMessagerieChange={setMessagerie} titleId="pdc-adhesion-paiement" titlePrefix="5. "/>'),
]
for old,new in repl:
    count=ad.count(old)
    if count!=1: raise SystemExit(f'ADHESION_ANCRE_INATTENDUE: {old} ({count}) — aucune écriture')
    ad=ad.replace(old,new,1)
old="  titleId = 'pdc-paiement',"
new="  titleId = 'pdc-paiement', titlePrefix = '',"
if pm.count(old)!=1: raise SystemExit('PAIEMENT_PROPS_INATTENDUS — aucune écriture')
pm=pm.replace(old,new,1)
old="<h2 id={titleId}>{t('donation.paymentTitle')}</h2>"
new="<h2 id={titleId}>{titlePrefix}{t('donation.paymentTitle').replace(/^\\s*5\\.\\s*/, '')}</h2>"
if pm.count(old)!=1: raise SystemExit('PAIEMENT_TITRE_INATTENDU — aucune écriture')
pm=pm.replace(old,new,1)
# Conserver 5. par défaut dans Soutenir, car le libellé partagé contient déjà le numéro.
# Lorsque Adhérer passe titlePrefix, ne pas doubler la numérotation.
pm=pm.replace("{titlePrefix}{t('donation.paymentTitle').replace(/^\\s*5\\.\\s*/, '')}", "{titlePrefix ? `${titlePrefix}${t('donation.paymentTitle').replace(/^\\s*5\\.\\s*/, '')}` : t('donation.paymentTitle')}")
path.write_text(ad,encoding='utf8');shared.write_text(pm,encoding='utf8')
print('SIX_RUBRIQUES_APPLIQUEES: 1 type / 2 identité / 3 cotisation / 4 carte / 5 paiement / 6 déclarations')
