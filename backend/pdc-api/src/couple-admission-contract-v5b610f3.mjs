// V5-B.6.10-F3 — validation pure d'un résultat d'admission de couple.
// Aucun appel SQL, aucune API HTTP, aucune permission accordée.
// Ne sert JAMAIS de preuve de paiement : la seule admission est la fonction SQL privée F3.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMBER=/^[MF]-PDC-I-[0-9]{6}$/;
const fail=()=>{throw new Error('PDC_COUPLE_ADMISSION_RESULT_INVALID');};

export function validateCoupleAdmissionResult(rows) {
  if (!Array.isArray(rows) || rows.length!==2) fail();
  const bySlot=new Map();
  for (const item of rows) {
    if (!item || !['member','partner'].includes(item.slot) || bySlot.has(item.slot) ||
        typeof item.membership_id!=='string' || !UUID.test(item.membership_id) ||
        typeof item.member_number!=='string' || !NUMBER.test(item.member_number)) fail();
    bySlot.set(item.slot,{membershipId:item.membership_id,memberNumber:item.member_number});
  }
  if (!bySlot.has('member') || !bySlot.has('partner')) fail();
  const member=bySlot.get('member'), partner=bySlot.get('partner');
  if (member.membershipId.toLowerCase()===partner.membershipId.toLowerCase() ||
      member.memberNumber===partner.memberNumber ||
      member.memberNumber.slice(-6)===partner.memberNumber.slice(-6)) fail();
  return Object.freeze({
    member:Object.freeze({...member}),
    partner:Object.freeze({...partner}),
  });
}
