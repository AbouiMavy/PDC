#!/usr/bin/env python3
"""Correction idempotente : grille de paiement commune Adhérer / Soutenir.

A appliquer dans /workspaces/PDC-v5c sur feature/v5c, sans migration ni appels réseau.
"""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
# Le ZIP est extrait dans la racine du dépôt : scripts/... puis src/...
# Si nécessaire, passer explicitement la racine du dépôt comme seul argument.
if len(sys.argv) > 1:
    root = Path(sys.argv[1]).resolve()
else:
    # Script installé dans scripts/ à la racine du dépôt.
    root = Path(__file__).resolve().parent.parent

adhesion = root / 'src/pages/Adhesion.jsx'
donation = root / 'src/components/DonForm/DonForm.jsx'
shared = root / 'src/components/PaymentMethods/PaymentMethods.jsx'
if not all(p.is_file() for p in (adhesion, donation, shared)):
    raise SystemExit('FICHIERS_MANQUANTS — extraire le ZIP depuis la racine du dépôt.')

ad = adhesion.read_text(encoding='utf-8')
dn = donation.read_text(encoding='utf-8')

if 'PaymentMethods from' in ad and 'PaymentMethods from' in dn:
    print('DEJA_APPLIQUE — aucune modification.')
    sys.exit(0)
if 'PaymentMethods from' in ad or 'PaymentMethods from' in dn:
    raise SystemExit('PATCH_PARTIEL — aucune écriture, vérifier les fichiers.')

def once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise SystemExit(f'ANCRE_INATTENDUE_{label}: {count}; aucun fichier modifié.')
    return src.replace(old, new, 1)

# 1) DonForm : retirer les anciennes constantes et la fonction copier locale.
dn = once(dn,
    "import { communesPourDepartement } from '../../features/adhesion/communes-cm';",
    "import { communesPourDepartement } from '../../features/adhesion/communes-cm';\nimport PaymentMethods from '../PaymentMethods/PaymentMethods';",
    'DON_IMPORT')
start = dn.index("const METHODES = ['mobile', 'tara', 'carte', 'virement'];")
end = dn.index("const integer = value =>", start)
dn = dn[:start] + dn[end:]
dn = once(dn,"  const [copie,setCopie] = useState('');\n",'', 'DON_COPIE')
start = dn.index('  async function copier(text,which) {')
end = dn.index('  function soumettre(event) {', start)
dn = dn[:start] + dn[end:]
start = dn.index('    <section className="pdc-don-form__section" aria-labelledby="pdc-paiement">')
end = dn.index('    <section className="pdc-don-form__section" aria-labelledby="pdc-declaration">', start)
dn = dn[:start] + '''    <PaymentMethods methode={methode} onMethodeChange={setMethode}
      messagerie={messagerie} onMessagerieChange={setMessagerie} titleId="pdc-paiement"/>
''' + dn[end:]

# 2) Adhesion : même composant, choix indépendant en mémoire et récapitulatif.
ad = once(ad,
    "import { useTranslation } from 'react-i18next';",
    "import { useTranslation } from 'react-i18next';\nimport PaymentMethods from '../components/PaymentMethods/PaymentMethods';\nimport '../components/DonForm/DonForm.css';",
    'AD_IMPORT')
ad = once(ad,"  const {i18n}=useTranslation();", "  const {i18n,t:donationText}=useTranslation();", 'AD_TRANS')
ad = once(ad,
    "  const [error,setError]=useState('');",
    "  const [error,setError]=useState('');\n  const [methode,setMethode]=useState('mobile');\n  const [messagerie,setMessagerie]=useState('whatsapp');",
    'AD_STATE')
ad = once(ad,
    '        {isNew && <p className="pdc-adhesion-fee-note">{t.membershipLegal}</p>}',
    '''        <div className="pdc-don-form pdc-adhesion-payment-methods">
          <PaymentMethods methode={methode} onMethodeChange={setMethode}
            messagerie={messagerie} onMessagerieChange={setMessagerie} titleId="pdc-adhesion-paiement"/>
        </div>
        {isNew && <p className="pdc-adhesion-fee-note">{t.membershipLegal}</p>}''',
    'AD_SECTION')
ad = once(ad,
    '      </dl>\n      {isNew && form.demandeCarte',
    '''        <div><dt>{t.payment}</dt><dd>{donationText(`donation.methods.${methode}`)}
          {methode==='tara' ? ` — ${messagerie==='telegram'?'Telegram':'WhatsApp'}` : ''}</dd></div>
      </dl>
      {isNew && form.demandeCarte''',
    'AD_RECAP')

# Toutes les ancres sont vérifiées avant le premier write.
adhesion.write_text(ad,encoding='utf-8')
donation.write_text(dn,encoding='utf-8')
print('PAIEMENTS_ADHESION_APPLIQUES: modes communs, rappel récapitulatif, aucun appel réseau')
