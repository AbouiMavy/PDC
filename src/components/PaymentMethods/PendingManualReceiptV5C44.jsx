import {Link} from 'react-router-dom';
import '../../pages/Adhesion.css';

// Résultat de navigation uniquement, sans endpoint de confirmation ni preuve de paiement.
export default function PendingManualReceiptV5C44({receipt,language='fr'}) {
  const fr=language!=='en';
  const membership=receipt.source==='membership';
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
      <p>{fr
        ? 'Ce message confirme la réception de la demande, pas l’encaissement du paiement, ni l’admission au parti. Ne soumettez pas une seconde demande pour le même paiement.'
        : 'This confirms receipt of the request, not receipt of funds or party membership. Do not submit a duplicate request.'}</p>
      <p>{fr
        ? 'TaraMoney peut remettre un reçu au payeur après règlement. Conservez ce justificatif ; le montant brut versé est distinct du montant net reçu par le PDC après frais.'
        : 'TaraMoney may issue a payer receipt after payment. Keep it; the gross amount paid differs from the net amount received by PDC after fees.'}</p>
      <p>{fr?'Une vérification administrative distincte est requise.':'A separate administrative check is required.'}</p>
      <div className="pdc-adhesion-actions"><Link className="pdc-adhesion-primary" to="/">
        {fr?'Retour à l’accueil':'Back to home'}</Link></div>
    </section>
  </main>;
}
