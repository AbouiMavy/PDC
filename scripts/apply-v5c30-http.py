#!/usr/bin/env python3
"""V5-C.30 : trois substitutions exactes, validées AVANT toute écriture.
Idempotent. Ne modifie aucun objet SQL et ne démarre aucun listener.
"""
from pathlib import Path

patches = {
  Path('backend/pdc-api/src/v5c/tara-public-order-http-v5c.mjs'): [
    ("import { createServer } from 'node:http';",
     "import { createServer } from 'node:http';\nimport {isIP} from 'node:net';\n// V5C30: adresse client vérifiée avant les protections anti-abus."),
    ("  allowedOrigins=[],enabled=false,environment='disabled'}={}) {",
     "  allowedOrigins=[],resolveClientAddress=(req)=>req.socket.remoteAddress,\n  enabled=false,environment='disabled'}={}) {"),
    ("      typeof verifyHuman!=='function' || !Array.isArray(allowedOrigins) ||",
     "      typeof verifyHuman!=='function' || typeof resolveClientAddress!=='function' ||\n      !Array.isArray(allowedOrigins) ||"),
    ("      const address=req.socket.remoteAddress ?? 'unknown';",
     "      let address;\n      try {address=resolveClientAddress(req);}\n      catch {return respond(res,403,{error:'CLIENT_ADDRESS_UNTRUSTED'},cors);}\n      if (typeof address!=='string' || !isIP(address))\n        return respond(res,403,{error:'CLIENT_ADDRESS_UNTRUSTED'},cors);"),
  ],
  Path('backend/pdc-api/src/v5c/tara-public-sandbox-app-v5c.mjs'): [
    ("  issueLinks=false,enabled=false,environment='disabled'}={}) {",
     "  resolveClientAddress,issueLinks=false,enabled=false,environment='disabled'}={}) {"),
    ("    allowedOrigins,enabled:true,environment:'sandbox'});",
     "    allowedOrigins,resolveClientAddress,enabled:true,environment:'sandbox'});"),
  ],
  Path('backend/pdc-api/src/v5c/public-sandbox-composition-v5c29.mjs'): [
    ("  enabled=false,environment='disabled'}={}){",
     "  resolveClientAddress,enabled=false,environment='disabled'}={}){"),
    ("    allowedOrigins,issueLinks,enabled:true,environment:'sandbox'});",
     "    allowedOrigins,resolveClientAddress,issueLinks,enabled:true,environment:'sandbox'});"),
  ],
}

replacements = {}
for path, changes in patches.items():
    if not path.is_file(): raise SystemExit(f'ARRÊT : fichier absent {path}')
    original=path.read_text(encoding='utf-8')
    marker = 'V5C30:' if path.name == 'tara-public-order-http-v5c.mjs' else 'resolveClientAddress'
    if marker in original:
        print(f'DÉJÀ APPLIQUÉ : {path}')
        continue
    text=original
    for old,new in changes:
        count=text.count(old)
        if count!=1: raise SystemExit(f'ARRÊT : ancre invalide ({count}) : {path} : {old[:80]}')
        text=text.replace(old,new,1)
    replacements[path]=text
# L'ensemble des fichiers est prévalidé : aucune écriture si une ancre ne correspond pas.
for path, text in replacements.items():
    path.write_text(text,encoding='utf-8')
    print(f'MODIFIÉ : {path}')
print('V5-C.30 : terminé, sans activation HTTP/SQL/Tara.')
