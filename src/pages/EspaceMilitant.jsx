import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAdhesionText } from '../features/adhesion/textes';
import './Adhesion.css';
/** V5-A: static preview. Never performs lookups by public member ID. */
export default function EspaceMilitant(){
  const {i18n}=useTranslation();
  const t=getAdhesionText(i18n.resolvedLanguage?.startsWith('en')?'en':'fr');
  return <main className="pdc-adhesion"><section className="pdc-adhesion-card"><h1>{t.spaceTitle}</h1><p>{t.spaceIntro}</p>
    <div className="pdc-adhesion-grid"><article className="pdc-adhesion-panel"><h2>{t.spaceId}</h2><p>—</p></article><article className="pdc-adhesion-panel"><h2>{t.spaceDues}</h2><p>{t.spaceDemo}</p></article><article className="pdc-adhesion-panel"><h2>{t.spaceDocs}</h2><p>{t.docsTitle}</p></article></div>
    <p className="pdc-adhesion-alert">{t.spaceHelp}</p><Link to="/adhesion" className="pdc-adhesion-primary">{t.spaceButton}</Link>
  </section></main>;
}
