// R5 : garde-fou d'orientation vers F3/F4 et atelier cartes, sans émission.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateR5CardReadiness({beneficiaries,orderStatus}={}){
  if(!['payment_verified','under_administrative_review'].includes(orderStatus)||!Array.isArray(beneficiaries)||
     beneficiaries.length<1||beneficiaries.length>2)throw Error('PDC_R5_CARD_NOT_READY');
  const slots=new Set(),numbers=new Set();
  for(const p of beneficiaries){
    if(!p||!['member','partner'].includes(p.slot)||slots.has(p.slot)||
       !UUID.test(p.cardRequestId??'')||p.applicationStatus!=='accepted'||
       p.membershipStatus!=='active'||p.cardStatus!=='reviewed'||
       p.photoStatus!=='stored'||!/^[MF]-PDC-I-[0-9]{6}$/.test(p.memberNumber??'')||
       numbers.has(p.memberNumber))throw Error('PDC_R5_CARD_NOT_READY');
    slots.add(p.slot);numbers.add(p.memberNumber);
  }
  if(!slots.has('member')||(beneficiaries.length===2&&!slots.has('partner')))throw Error('PDC_R5_CARD_NOT_READY');
  return Object.freeze({readyForPrivateProductionReview:true,issueCard:false,
    requiresPortraitPromotion:true,requiresNationalAdminApproval:true});
}
