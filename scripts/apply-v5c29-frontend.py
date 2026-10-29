#!/usr/bin/env python3
"""V5-C.29 - patch reproductible; aucune modification avant validation de tous les ancres."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
updates={}

def change(path,old,new,expected=1):
    p=ROOT/path
    s=updates.get(p,p.read_text(encoding='utf-8'))
    if s.count(old)!=expected:
        raise SystemExit(f'ARRÊT sans écriture : {path}: attendu {expected} ancre(s), trouvé {s.count(old)}')
    updates[p]=s.replace(old,new)

change('src/components/DonForm/DonForm.jsx',
       "methode,messagerie,anonymePublic:Boolean(values.anonymePublic)",
       "methode,messagerie,anonymePublic:Boolean(values.anonymePublic),\n"
       "      telephoneE164:indicatif + (['FR','GB','DE'].includes(pays)\n"
       "        ? telephoneLocal.replace(/[\\s().-]/g,'').replace(/^0/,'')\n"
       "        : telephoneLocal.replace(/[\\s().-]/g,''))")

change('src/pages/Soutenir.jsx',
       "import DonForm from '../components/DonForm/DonForm';",
       "import DonForm from '../components/DonForm/DonForm';\n"
       "import PublicCheckoutV5C29, {publicCheckoutSandboxEnabled} from '../components/PaymentMethods/PublicCheckoutV5C29';")
change('src/pages/Soutenir.jsx',
       "      <p className=\"pdc-soutenir-draft\">{t('flow.noPayment')}</p>\n"
       "      <p className=\"pdc-soutenir-draft\">{t(review.methode==='virement'?'flow.bankPending':'flow.paymentUnavailable')}</p>",
       "      {publicCheckoutSandboxEnabled()\n"
       "        ? <PublicCheckoutV5C29 source=\"donation\" data={review}\n"
       "            language={i18n.resolvedLanguage?.startsWith('en')?'en':'fr'}/>\n"
       "        : <><p className=\"pdc-soutenir-draft\">{t('flow.noPayment')}</p>\n"
       "           <p className=\"pdc-soutenir-draft\">{t(review.methode==='virement'?'flow.bankPending':'flow.paymentUnavailable')}</p></>}")

change('src/pages/Adhesion.jsx',
       "import PaymentMethods from '../components/PaymentMethods/PaymentMethods';",
       "import PaymentMethods from '../components/PaymentMethods/PaymentMethods';\n"
       "import PublicCheckoutV5C29, {publicCheckoutSandboxEnabled} from '../components/PaymentMethods/PublicCheckoutV5C29';")
change('src/pages/Adhesion.jsx',
       '      <p className="pdc-adhesion-alert">{t.noPayment}</p>',
       '      {publicCheckoutSandboxEnabled()\n'
       '        ? <PublicCheckoutV5C29 source="membership" data={{form,amounts,methode,messagerie}} language={lang}/>\n'
       '        : <p className="pdc-adhesion-alert">{t.noPayment}</p>}')

# Contrôle intégrité : aucun script ne touche à des règles métier historiques.
for p,s in updates.items():
    if not s.strip() or '\x00' in s: raise SystemExit('ARRÊT : contenu non conforme')
for p,s in updates.items():p.write_text(s,encoding='utf-8')
print('V5-C.29 : 3 fichiers React mis à jour ; paiement désactivé par défaut.')
