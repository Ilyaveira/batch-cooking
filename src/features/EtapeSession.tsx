// Affichage d'une étape de session (écran Session et mode cuisine).
import type { Reglages } from '../domain/reglages';
import type { EtapeSession, Session } from '../domain/schema/plan';
import { texteEtapeAffiche } from '../domain/session';
import { PastillePoste, TexteEtape } from '../ui/composants';

export function ContenuEtape({ e, session, reglages }: { e: EtapeSession; session: Session; reglages: Reglages }) {
  const t = (texte: string) => texteEtapeAffiche(texte, e, session, reglages.four);
  return (
    <div className="etape-contenu">
      <div className="etape-entete">
        <span className="heure">{e.debut}</span>
        {e.alerte && (
          <span className="alerte-etape" role="img" aria-label="Action à ne pas rater">
            ⚠
          </span>
        )}
        <PastillePoste poste={e.poste} />
      </div>
      <p className="etape-texte">
        <TexteEtape texte={t(e.texte)} />
      </p>
      {e.details && (
        <ul className="etape-details">
          {e.details.map((d, i) => (
            <li key={i}>
              <TexteEtape texte={t(d)} />
            </li>
          ))}
        </ul>
      )}
      {e.poste === 'cook-expert' && !reglages.cookExpert && (
        <p className="texte-alerte petit">Cook Expert indiqué comme indisponible dans les réglages : étape à adapter.</p>
      )}
    </div>
  );
}
