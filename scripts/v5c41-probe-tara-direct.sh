#!/usr/bin/env bash
set -euo pipefail
umask 077

cd /workspaces/PDC-v5c

DIR="$HOME/.config/pdc-dev"

if [[ ! -s "$DIR/v5c41-project-ref" ||
      ! -s "$DIR/v5c41-webhook-token" ]]; then
  echo "Webhook V5-C.41 non configuré."
  exit 1
fi

REF="$(cat "$DIR/v5c41-project-ref")"
TOKEN="$(cat "$DIR/v5c41-webhook-token")"

if [[ ! "$REF" =~ ^[a-z0-9]{20}$ ||
      ! "$TOKEN" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Configuration webhook invalide."
  exit 1
fi

: "${CODESPACE_NAME:?Codespace requis}"
: "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?Domaine absent}"

echo "=== DIAGNOSTIC REEL TARAMONEY SANDBOX ==="

read -r -p "businessId TaraMoney commun : " BUSINESS_ID </dev/tty
read -r -s -p "Clé API TaraMoney SANDBOX : " SANDBOX_KEY </dev/tty
printf '\n'

if [[ -z "$BUSINESS_ID" || -z "$SANDBOX_KEY" ]]; then
  echo "Identifiants manquants."
  exit 1
fi

read -r -p \
  "Effectuer UN appel réel de création de lien ? (oui/non) : " \
  CONFIRM </dev/tty

if [[ "$CONFIRM" != "oui" ]]; then
  echo "Appel annulé."
  exit 0
fi

export PDC_PROBE_KEY="$SANDBOX_KEY"
export PDC_PROBE_BID="$BUSINESS_ID"
export PDC_PROBE_WEBHOOK="https://${REF}.supabase.co/functions/v1/pdc-tara-webhook?token=${TOKEN}"
export PDC_PROBE_RETURN="https://${CODESPACE_NAME}-5174.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/soutenir"

unset SANDBOX_KEY TOKEN

node --input-type=module <<'NODE'
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';

import {makeTaraLinkInput} from
  './backend/pdc-api/src/v5c/tara-server-client-v5c.mjs';

import {selectTaraPaymentLink} from
  './backend/pdc-api/src/v5c/tara-channel-links-v5c.mjs';

const productId=`PDC_${randomBytes(18).toString('base64url')}`;

const file=
  `${process.env.HOME}/.config/pdc-dev/tara-probe-${productId}.json`;

function save(data) {
  writeFileSync(
    file,
    JSON.stringify(data,null,2),
    {mode:0o600}
  );
}

const input=makeTaraLinkInput({
  productId,
  productName:'PDC Test Sandbox Mobile Money',
  productDescription:'Diagnostic technique PDC sans paiement',
  amountXaf:'500',
  returnUrl:process.env.PDC_PROBE_RETURN,
  webHookUrl:process.env.PDC_PROBE_WEBHOOK
});

save({
  productId,
  state:'request_started',
  createdAt:new Date().toISOString()
});

console.log('\n=== REQUETE TARAMONEY ===');
console.log('productId :',productId);
console.log('Montant : 500 FCFA');
console.log('Clé utilisée : celle saisie pour le Sandbox');
console.log('Endpoint : https://www.dklo.co/api/tara/paymentlinks');
console.log('Nombre maximal de POST : 1');

try {
  const response=await fetch(
    'https://www.dklo.co/api/tara/paymentlinks',
    {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Accept':'application/json'
      },
      body:JSON.stringify({
        apiKey:process.env.PDC_PROBE_KEY,
        businessId:process.env.PDC_PROBE_BID,
        ...input
      }),
      redirect:'error',
      signal:AbortSignal.timeout(15000)
    }
  );

  const raw=await response.text();

  if(raw.length>262144)
    throw Error('RESPONSE_TOO_LARGE');

  const data=JSON.parse(raw);

  if(!data || typeof data!=='object' ||
      Array.isArray(data))
    throw Error('INVALID_RESPONSE');

  const fields=[
    'generalLink','smsLink','whatsappLink',
    'telegramLink','dikaloLink','cardLink'
  ];

  console.log('\n=== REPONSE TARAMONEY ===');
  console.log('HTTP :',response.status);
  console.log(
    'Statut :',
    typeof data.status==='string' &&
    /^[a-zA-Z_]{2,40}$/.test(data.status)
      ? data.status
      : 'NON RENSEIGNE'
  );

  for(const field of fields){
    console.log(
      `${field} :`,
      typeof data[field]==='string' &&
      data[field].length>0 ? 'PRESENT' : 'ABSENT'
    );
  }

  console.log(
    'productId retourné :',
    typeof data.productId==='string'
      ? (data.productId===productId
        ? 'IDENTIQUE':'DIFFERENT')
      : 'ABSENT'
  );

  let selected=null;
  let validationError=null;

  if(response.ok){
    try{
      selected=selectTaraPaymentLink(
        data,
        {method:'mobile'}
      );
    }catch(e){
      validationError=e.code??'INVALID_LINK';
    }
  }

  save({
    productId,
    httpStatus:response.status,
    providerStatus:typeof data.status==='string'
      ?data.status:null,
    fieldsPresent:fields.filter(
      f=>typeof data[f]==='string' && data[f].length>0
    ),
    productIdEchoMatches:
      typeof data.productId==='string'
        ?data.productId===productId:null,
    smsLinkValid:selected!==null,
    validationError,
    paymentUrl:selected?.paymentUrl??null,
    state:selected?'link_received':'response_without_valid_smslink',
    checkedAt:new Date().toISOString()
  });

  console.log('\n=== VALIDATION PDC ===');
  console.log(
    'smsLink exploitable :',
    selected?'OUI':'NON'
  );

  if(validationError)
    console.log('Code de validation :',validationError);

  console.log('Paiement confirmé : NON');
  console.log('Appels de création effectués : 1');
  console.log('Résultat sauvegardé en fichier privé.');
  console.log('\nDIAGNOSTIC TERMINE');

}catch(error){
  save({
    productId,
    state:'unknown',
    errorClass:['TimeoutError','AbortError'].includes(error.name)
      ?'TIMEOUT':'UNUSABLE_RESPONSE',
    checkedAt:new Date().toISOString()
  });

  console.log('\nRESULTAT INCERTAIN');
  console.log('Aucun nouvel appel ne sera effectué.');
  console.log('Vérifier ce productId chez TaraMoney.');
  process.exitCode=1;
}
NODE
