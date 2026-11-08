// Affichage d'une étape de session, ou de plusieurs étapes fusionnées (écran Session et mode cuisine).
import type { Reglages } from '../domain/reglages';
import type { Bloc } from '../domain/reorganisation';
import type { EtapeSession, Session } from '../domain/schema/plan';
import { texteEtapeAffiche } from '../domain/session';
import { PastillePoste, TexteEtape } from '../ui/composants';

/** Consigne et sous-points d'une étape (températures du four annotées). */
export function TexteDEtape({ e, session, reglages }: { e: EtapeSession; session: Session; reglages: Reglages }) {
  const t = (texte: string) => texteEtapeAffiche(texte, e, session, reglages.four);
  return (
    <>
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
    </>
  );
}

/** En-tête d'un bloc : heure, ⚠ si une des étapes est une alerte, postes distincts. */
export function EnteteBloc({ bloc, heureHorloge, sansHeure }: { bloc: Bloc; heureHorloge?: string; sansHeure?: boolean }) {
  const postes = [...new Set(bloc.membres.map((m) => m.poste))];
  return (
    <div className="etape-entete">
      {!sansHeure && <span className="heure">{heureHorloge ?? bloc.debut}</span>}
      {heureHorloge && <span className="heure-relative">({bloc.debut})</span>}
      {bloc.membres.some((m) => m.alerte) && (
        <span className="alerte-etape" role="img" aria-label="Action à ne pas rater">
          ⚠
        </span>
      )}
      {postes.map((p) => (
        <PastillePoste key={p} poste={p} />
      ))}
    </div>
  );
}

export function ContenuBloc({
  bloc,
  session,
  reglages,
  heureHorloge,
  alertes,
}: {
  bloc: Bloc;
  session: Session;
  reglages: Reglages;
  /** Incohérences par id d'étape (étape placée avant la fin de la cuisson dont elle dépend). */
  alertes?: Map<string, string>;
  /** Heure réelle (« 14:35 ») quand une heure de début est indiquée en mode cuisine. */
  heureHorloge?: string;
}) {
  return (
    <div className="etape-contenu">
      <EnteteBloc bloc={bloc} heureHorloge={heureHorloge} />
      {bloc.membres.map((m) => (
        <div key={m.id} className={bloc.membres.length > 1 ? 'membre-fusion' : undefined}>
          <TexteDEtape e={m} session={session} reglages={reglages} />
          {alertes?.has(m.id) && <p className="texte-alerte petit">⚠ {alertes.get(m.id)}</p>}
        </div>
      ))}
      {bloc.membres.some((m) => m.poste === 'cook-expert') && !reglages.cookExpert && (
        <p className="texte-alerte petit">Cook Expert indiqué comme indisponible dans les réglages : étape à adapter.</p>
      )}
    </div>
  );
}
