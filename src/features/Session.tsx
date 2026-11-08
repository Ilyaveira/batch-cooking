// Organisation de la session : « à sortir », puis les étapes dans l'ordre chronologique.
// Mode « Réorganiser » : changer le n° d'une étape, la monter/descendre, ou changer son heure.
import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCochages, useReglages } from '../app/hooks';
import { cles, enregistrerPersonnalisation } from '../data/depot';
import { LIBELLES_STOCKAGE } from '../domain/constantes';
import { texteQuantite } from '../domain/courses';
import { formaterHeureSession, minutesDepuisDebut } from '../domain/dates';
import { changerHeure, deplacerEtape, ErreurReorganisation, type Personnalisation } from '../domain/reorganisation';
import type { EtapeSession, Plan, Semaine, Session as TypeSession } from '../domain/schema/plan';
import { aSortir, etapesTriees, planning } from '../domain/session';
import { Case, PastillePoste, TexteEtape } from '../ui/composants';
import { ContenuEtape } from './EtapeSession';
import { OngletsSemaine } from './OngletsSemaine';

/** Regroupe les étapes par tranches de 30 minutes. */
function parTranches(etapes: EtapeSession[]) {
  const groupes = new Map<number, EtapeSession[]>();
  for (const e of etapes) {
    const t = Math.floor(minutesDepuisDebut(e.debut) / 30);
    groupes.set(t, [...(groupes.get(t) ?? []), e]);
  }
  return [...groupes.entries()].map(([t, liste]) => ({
    libelle: `${formaterHeureSession(t * 30)} – ${formaterHeureSession(t * 30 + 30)}`,
    etapes: liste,
  }));
}

/** Valide un champ à la sortie (ou avec Entrée) ; en cas de refus, remet la valeur affichée. */
function valider(appliquer: (valeur: string) => boolean) {
  return {
    onBlur: (ev: FocusEvent<HTMLInputElement>) => {
      if (ev.target.value === ev.target.defaultValue) return;
      if (!appliquer(ev.target.value)) ev.target.value = ev.target.defaultValue;
    },
    onKeyDown: (ev: KeyboardEvent<HTMLInputElement>) => {
      if (ev.key === 'Enter') ev.currentTarget.blur();
    },
  };
}

function Reorganisation({
  plan,
  semaine,
  session,
  origine,
  modifiee,
}: {
  plan: Plan;
  semaine: Semaine;
  session: TypeSession;
  origine: TypeSession;
  modifiee: boolean;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const etapes = etapesTriees(session);

  const modifier = (calcul: () => Personnalisation | null): boolean => {
    try {
      const perso = calcul();
      setErreur(null);
      void enregistrerPersonnalisation(plan.mois, semaine.numero, perso);
      return true;
    } catch (e) {
      if (!(e instanceof ErreurReorganisation)) throw e;
      setErreur(e.message);
      return false;
    }
  };
  const deplacer = (id: string, position: number) => modifier(() => deplacerEtape(session, origine, id, position));

  return (
    <>
      <p className="discret petit">
        Changez le n° d’une étape pour la déplacer (les suivantes sont décalées), ou utilisez les flèches. Une étape déplacée
        prend l’heure de l’étape dont elle prend la place. Changer une heure replace l’étape au bon endroit.
      </p>
      {erreur && (
        <p className="texte-alerte" role="alert">
          {erreur}
        </p>
      )}
      <ol className="reorganisation">
        {etapes.map((e, i) => (
          <li key={`${e.id}-${i}-${e.debut}`} className="ligne-reorganisation">
            <div className="reorganisation-commandes">
              <label className="champ-court">
                <span className="visuellement-cache">Numéro de l’étape</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={etapes.length}
                  defaultValue={i + 1}
                  aria-label={`Numéro de l’étape ${i + 1}`}
                  {...valider((v) => deplacer(e.id, Number(v)))}
                />
              </label>
              <button
                type="button"
                className="bouton-rond"
                aria-label={`Monter l’étape ${i + 1}`}
                disabled={i === 0}
                onClick={() => deplacer(e.id, i)}
              >
                ↑
              </button>
              <button
                type="button"
                className="bouton-rond"
                aria-label={`Descendre l’étape ${i + 1}`}
                disabled={i === etapes.length - 1}
                onClick={() => deplacer(e.id, i + 2)}
              >
                ↓
              </button>
              <label className="champ-court">
                <span className="visuellement-cache">Heure de début</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="champ-heure"
                  defaultValue={e.debut}
                  aria-label={`Heure de l’étape ${i + 1}`}
                  {...valider((v) => modifier(() => changerHeure(session, origine, e.id, v)))}
                />
              </label>
              <PastillePoste poste={e.poste} />
            </div>
            <p className="etape-texte">
              <TexteEtape texte={e.texte} />
            </p>
          </li>
        ))}
      </ol>
      {modifiee && (
        <button
          type="button"
          className="bouton-secondaire"
          onClick={() =>
            confirm('Revenir à l’ordre et aux heures du plan importé ?') &&
            void enregistrerPersonnalisation(plan.mois, semaine.numero, null)
          }
        >
          Revenir à l’ordre du plan
        </button>
      )}
    </>
  );
}

export function Session({
  plan,
  semaine,
  origine,
  modifiee = false,
}: {
  plan: Plan;
  /** Semaine avec l'ordre et les heures modifiés dans l'app déjà appliqués. */
  semaine: Semaine;
  /** Session telle qu'importée (référence pour la réorganisation). */
  origine?: TypeSession;
  modifiee?: boolean;
}) {
  const reglages = useReglages();
  const prefixe = cles.prefixeEtapes(plan.mois, semaine.numero);
  const { coches, basculer } = useCochages(prefixe);
  const [reorganiser, setReorganiser] = useState(false);
  const a = aSortir(plan, semaine);
  const session = semaine.session;

  return (
    <>
      <OngletsSemaine plan={plan} semaine={semaine} vue="/session" />
      {session && !reorganiser && (
        <Link className="bouton bouton-large" to={`/semaine/${semaine.numero}/cuisine`}>
          Passer en mode cuisine
        </Link>
      )}

      {!reorganiser && (
        <section className="carte">
          <h2>À sortir</h2>
          {a.parStockage.map((g) => (
            <div key={g.stockage}>
              <h3>{LIBELLES_STOCKAGE[g.stockage]}</h3>
              <ul className="liste-simple">
                {g.lignes.map((l) => (
                  <li key={l.cle}>
                    {l.ingredient.nom} <span className="discret">· {texteQuantite(l)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {a.ustensiles.length > 0 && (
            <>
              <h3>Ustensiles</h3>
              <p>{a.ustensiles.join(', ')}</p>
            </>
          )}
        </section>
      )}

      {!session ? (
        <p className="discret">Ce plan ne contient pas de déroulé de session pour cette semaine.</p>
      ) : (
        <section className="carte">
          <div className="titre-avec-action">
            <h2>Étapes</h2>
            {origine && (
              <button type="button" className={reorganiser ? 'bouton' : 'bouton-secondaire'} onClick={() => setReorganiser(!reorganiser)}>
                {reorganiser ? 'Terminer' : 'Réorganiser'}
              </button>
            )}
          </div>
          {modifiee && <p className="bandeau-info">Ordre modifié sur cet appareil.</p>}
          {reorganiser && origine ? (
            <Reorganisation plan={plan} semaine={semaine} session={session} origine={origine} modifiee={modifiee} />
          ) : (
            <>
              <p className="discret">
                {session.etapes.length} étapes · environ {formaterHeureSession(session.dureeMin ?? planning(session).finMin)}.
                L’heure compte depuis le début de la session.
              </p>
              {parTranches(etapesTriees(session)).map((t) => (
                <div key={t.libelle}>
                  <h3 className="tranche">{t.libelle}</h3>
                  {t.etapes.map((e) => {
                    const cle = cles.etape(plan.mois, semaine.numero, e.id);
                    return (
                      <Case key={e.id} coche={coches.has(cle)} onChange={() => void basculer(cle)}>
                        <ContenuEtape e={e} session={session} reglages={reglages} />
                      </Case>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </>
  );
}
