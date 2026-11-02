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
  const title=membership
    ? (fr?'Merci pour votre demande d’adhésion au PDC !':'Thank you for your PDC membership application!')
    : (fr?'Merci pour votre don au PDC !':'Thank you for your donation to PDC!');
  return <main className="pdc-adhesion pdc-adhesion-thanks">
    <section className="pdc-adhesion-card" aria-live="polite">
      <h1>{title}</h1>
      <p>{membership
        ? (fr?'Votre demande d’adhésion a bien été enregistrée.':'Your membership application has been registered.')
        : (fr?'Votre demande de don a bien été enregistrée.':'Your donation request has been registered.')}</p>
      <p>{fr
        ? 'Conservez précieusement votre reçu TaraMoney et les références de votre dossier PDC. Ces informations pourront vous être demandées ultérieurement.'
        : 'Keep your TaraMoney receipt and PDC application references. You may need them later.'}</p>
      <p><strong>{fr?'Référence PDC':'PDC reference'} : </strong><code>{receipt.paymentId}</code></p>
      {receipt.productId && <p><strong>{fr?'Référence de rapprochement Tara/PDC':'Tara/PDC reconciliation reference'} : </strong><code>{receipt.productId}</code></p>}
      <p><strong>{fr?'Montant brut attendu':'Expected gross amount'} : </strong>{receipt.amountXaf} FCFA</p>
      <div className="pdc-adhesion-actions">
        <button className="pdc-adhesion-secondary" type="button" onClick={saveAcknowledgment}>
          {fr?'Télécharger mon accusé de réception':'Download my acknowledgment'}
        </button>
        <Link className="pdc-adhesion-primary" to="/">
        {fr?'Retour à l’accueil':'Back to home'}</Link></div>
    </section>
  </main>;
}
