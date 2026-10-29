import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import './Adhesion.css';

// Le navigateur ne confirme aucun paiement : aucun parametre URL n'est une preuve.
export default function RetourPaiementV5C44(){
  const {i18n}=useTranslation();
  const fr=!i18n.resolvedLanguage?.startsWith('en');
  return <main className="pdc-adhesion pdc-adhesion-thanks">
    <section className="pdc-adhesion-card">
      <h1>{fr?'Retour de TaraMoney':'Return from TaraMoney'}</h1>
      <h2>{fr?'Paiement en attente de vérification':'Payment awaiting verification'}</h2>
      <p>{fr
        ? 'Votre retour depuis TaraMoney ne confirme pas que votre paiement a réussi. Conservez le reçu du prestataire et votre référence PDC. La trésorerie vérifiera le paiement.'
        : 'Returning from TaraMoney does not confirm a successful payment. Keep your provider receipt and PDC reference. The finance team will verify the payment.'}</p>
      <p>{fr
        ? 'Ne soumettez pas une seconde commande pour le même paiement. La confirmation de votre adhésion, le cas échéant, relève d’une vérification distincte.'
        : 'Do not resubmit the same payment. Membership approval, if applicable, is subject to separate verification.'}</p>
      <Link to="/" className="pdc-adhesion-primary">{fr?'Retour à l’accueil':'Back to home'}</Link>
    </section>
  </main>;
}
