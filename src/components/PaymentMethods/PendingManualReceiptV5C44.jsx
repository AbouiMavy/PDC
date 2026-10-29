import {Link} from 'react-router-dom';
import '../../pages/Adhesion.css';

// Résultat de navigation uniquement, sans endpoint de confirmation ni preuve de paiement.
export default function PendingManualReceiptV5C44({receipt,language='fr'}) {
  const fr=language!=='en';
  const membership=receipt.source==='membership';
  function saveAcknowledgment() {
    // Fichier local uniquement ; ne constitue ni reçu de paiement ni preuve d'admission.
    const lines=[
      fr?'PDC — ACCUSÉ DE RÉCEPTION DE DEMANDE':'PDC — REQUEST ACKNOWLEDGMENT',
      fr?'Paiement en attente de vérification':'Payment pending verification',
      `${fr?'Référence PDC':'PDC reference'} : ${receipt.paymentId}`,
      ...(receipt.productId?[`${fr?'Référence Tara/PDC':'Tara/PDC reference'} : ${receipt.productId}`]:[]),
      `${fr?'Montant brut attendu':'Expected gross amount'} : ${receipt.amountXaf} XAF`,
      fr?'Document non valable comme reçu de paiement.':'Not a payment receipt.',
    ];
    const blob=new Blob([lines.join('\n')+'\n'],{type:'text/plain;charset=utf-8'});
    const blobUrl=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=blobUrl;
    a.download=`PDC-accuse-reception-${receipt.paymentId}.txt`;
    document.body.appendChild(a);
    a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
  }
  const title=membership?(fr?'Demande d’adhésion reçue':'Membership request received'):
    (fr?'Demande de contribution reçue':'Contribution request received');
  return <main className="pdc-adhesion pdc-adhesion-thanks">
    <section className="pdc-adhesion-card" aria-live="polite">
      <h1>{title}</h1>
      <h2>{fr?'Paiement en attente de vérification':'Payment awaiting verification'}</h2>
      <p>{fr
        ? 'Votre demande a été enregistrée. Conservez la référence ci-dessous. Le PDC rapprochera manuellement votre paiement avec les données TaraMoney.'
        : 'Your request has been registered. Keep the reference below. PDC will manually reconcile payment details with TaraMoney.'}</p>
      <p><strong>{fr?'Référence PDC':'PDC reference'} : </strong><code>{receipt.paymentId}</code></p>
      {receipt.productId && <p><strong>{fr?'Référence de rapprochement Tara/PDC':'Tara/PDC reconciliation reference'} : </strong><code>{receipt.productId}</code></p>}
      <p><strong>{fr?'Montant brut attendu':'Expected gross amount'} : </strong>{receipt.amountXaf} FCFA</p>
      <p>{membership
        ? (fr
          ? 'Ce message confirme la réception du dossier, pas l’encaissement du paiement ni votre admission au parti. Ne soumettez pas une seconde demande pour le même paiement.'
          : 'This confirms receipt of the application, not receipt of funds or admission to the party. Do not submit a duplicate request.')
        : (fr
          ? 'Ce message confirme la réception de votre demande de don, pas son encaissement. Ne soumettez pas une seconde demande pour le même paiement.'
          : 'This confirms receipt of your donation request, not receipt of funds. Do not submit a duplicate request.')}</p>
      <p>{fr
        ? 'TaraMoney peut remettre un reçu au payeur après règlement. Conservez ce justificatif ; le montant brut versé est distinct du montant net reçu par le PDC après frais.'
        : 'TaraMoney may issue a payer receipt after payment. Keep it; the gross amount paid differs from the net amount received by PDC after fees.'}</p>
      {membership&&<p>{fr?'Une vérification administrative distincte est requise.':'A separate administrative check is required.'}</p>}
      <div className="pdc-adhesion-actions">
        <button className="pdc-adhesion-secondary" type="button" onClick={saveAcknowledgment}>
          {fr?'Télécharger mon accusé de réception':'Download my acknowledgment'}
        </button>
        <Link className="pdc-adhesion-primary" to="/">
        {fr?'Retour à l’accueil':'Back to home'}</Link></div>
    </section>
  </main>;
}
