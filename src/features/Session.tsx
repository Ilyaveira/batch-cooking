// Organisation de la session : « à sortir », puis les étapes dans l'ordre chronologique.
// Mode « Réorganiser » : déplacer (n° ou flèches), changer l'heure, modifier le texte,
// scinder une étape, fusionner avec la suivante ou défaire une fusion.
import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCochages, useReglages } from '../app/hooks';
import { cles, cocher, enregistrerPersonnalisation } from '../data/depot';
import { LIBELLES_STOCKAGE } from '../domain/constantes';
import { texteQuantite } from '../domain/courses';
import { formaterHeureSession, minutesDepuisDebut } from '../domain/dates';
import {
  appliquerPersonnalisation,
  blocs as calculerBlocs,
  changerDurees,
  changerHeure,
  compterDecalees,
  deplacerEtape,
  ErreurReorganisation,
  formaterSaisieEtape,
  fusionnerAvecSuivante,
  incoherences as calculerIncoherences,
  modifierTexte,
  personnalisationDe,
  proposerCoupure,
  scinderEtape,
  separerFusion,
  type Bloc,
  type Personnalisation,
} from '../domain/reorganisation';
import type { EtapeSession, Plan, Semaine, Session as TypeSession } from '../domain/schema/plan';
import { aSortir, etapesTriees, planning } from '../domain/session';
import { Case, TexteEtape } from '../ui/composants';
import { ContenuBloc, EnteteBloc } from './EtapeSession';
import { Gantt } from './Gantt';
import { OngletsSemaine } from './OngletsSemaine';

/** Regroupe les blocs par tranches de 30 minutes. */
function parTranches(liste: Bloc[]) {
  const groupes = new Map<number, Bloc[]>();
  for (const b of liste) {
    const t = Math.floor(minutesDepuisDebut(b.debut) / 30);
    groupes.set(t, [...(groupes.get(t) ?? []), b]);
  }
  return [...groupes.entries()].map(([t, l]) => ({
    libelle: `${formaterHeureSession(t * 30)} – ${formaterHeureSession(t * 30 + 30)}`,
    blocs: l,
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

/** Durées d'une étape : minutes actives + cuisson passive → heure de fin (modifiables). */
function Durees({ e, libelle, changer }: { e: EtapeSession; libelle: string; changer: (actif: number, passif: number) => boolean }) {
  const passif = e.passifMin ?? 0;
  const fin = formaterHeureSession(minutesDepuisDebut(e.debut) + e.actifMin + passif);
  return (
    <div className="durees">
      <label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={e.actifMin}
          aria-label={`Minutes actives de l’${libelle}`}
          {...valider((v) => changer(Number(v), passif))}
        />{' '}
        min
      </label>
      <span aria-hidden="true">+</span>
      <label>
        cuisson{' '}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={passif}
          aria-label={`Minutes de cuisson de l’${libelle}`}
          {...valider((v) => changer(e.actifMin, Number(v)))}
        />{' '}
        min
      </label>
      <span className="fin-etape">→ fin {fin}</span>
    </div>
  );
}

/** Éditeur d'une étape : modifier la consigne et les sous-points, ou scinder en deux. */
function EditeurEtape({
  e,
  modifier,
  fermer,
  session,
  origine,
}: {
  e: EtapeSession;
  modifier: (calcul: () => Personnalisation | null) => boolean;
  fermer: () => void;
  session: TypeSession;
  origine: TypeSession;
}) {
  const [saisie, setSaisie] = useState(formaterSaisieEtape(e));
  const [seconde, setSeconde] = useState<string | null>(null);
  const aide = 'Une ligne commençant par « - » devient un sous-point. Entourez un ingrédient de ** pour le mettre en gras.';
  const scinder = () => {
    const [a, b] = proposerCoupure({ texte: saisie.split('\n')[0] ?? '', details: undefined });
    const reste = saisie.split('\n').slice(1).join('\n');
    setSaisie(a);
    setSeconde([b, reste].filter(Boolean).join('\n'));
  };
  return (
    <div className="editeur-etape">
      <label className="champ">
        {seconde === null ? 'Texte de l’étape' : '1ʳᵉ partie (garde l’heure et le minuteur)'}
        <textarea rows={4} value={saisie} onChange={(ev) => setSaisie(ev.target.value)} />
      </label>
      {seconde !== null && (
        <label className="champ">
          2ᵉ partie (même heure, juste après, sans minuteur)
          <textarea rows={4} value={seconde} onChange={(ev) => setSeconde(ev.target.value)} />
        </label>
      )}
      <p className="discret petit">{aide}</p>
      <div className="actions">
        {seconde === null ? (
          <>
            <button type="button" className="bouton" onClick={() => modifier(() => modifierTexte(session, origine, e.id, saisie)) && fermer()}>
              Enregistrer
            </button>
            <button type="button" className="bouton-secondaire" onClick={scinder}>
              Scinder en deux
            </button>
          </>
        ) : (
          <button
            type="button"
            className="bouton"
            onClick={() => modifier(() => scinderEtape(session, origine, e.id, saisie, seconde)) && fermer()}
          >
            Valider la scission
          </button>
        )}
        <button type="button" className="bouton-secondaire" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
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
  const [enEdition, setEnEdition] = useState<string | null>(null);
  // Après un décalage d'étapes liées : message + personnalisation précédente pour « Annuler ».
  const [decalage, setDecalage] = useState<{ n: number; precedente: Personnalisation | null } | null>(null);
  const liste = calculerBlocs(session);
  const alertes = calculerIncoherences(session, origine);

  /** Applique une modification ; `ids` = étapes touchées directement (pour compter les liées). */
  const modifier = (calcul: () => Personnalisation | null, ids: string[] = []): boolean => {
    try {
      const precedente = personnalisationDe(etapesTriees(session), origine);
      const perso = calcul();
      setErreur(null);
      const n = ids.length ? compterDecalees(session, appliquerPersonnalisation(origine, perso), ids) : 0;
      setDecalage(n > 0 ? { n, precedente } : null);
      void enregistrerPersonnalisation(plan.mois, semaine.numero, perso);
      return true;
    } catch (e) {
      if (!(e instanceof ErreurReorganisation)) throw e;
      setErreur(e.message);
      return false;
    }
  };
  const idsDe = (b: Bloc) => b.membres.map((m) => m.id);
  const deplacer = (b: Bloc, position: number) => modifier(() => deplacerEtape(session, origine, b.id, position), idsDe(b));

  return (
    <>
      <p className="discret petit">
        Changez le n° d’un bloc pour le déplacer (les suivants sont décalés), ou utilisez les flèches : il prend l’heure de la place
        qu’il occupe. Changer une heure replace le bloc au bon endroit. « Modifier » permet de réécrire ou de scinder une étape.
      </p>
      {erreur && (
        <p className="texte-alerte" role="alert">
          {erreur}
        </p>
      )}
      {decalage && (
        <p className="bandeau-info" role="status">
          {decalage.n} étape{decalage.n > 1 ? 's' : ''} liée{decalage.n > 1 ? 's' : ''} décalée{decalage.n > 1 ? 's' : ''} d’autant (même
          ligne du planning).{' '}
          <button
            type="button"
            className="bouton-lien"
            onClick={() => {
              void enregistrerPersonnalisation(plan.mois, semaine.numero, decalage.precedente);
              setDecalage(null);
            }}
          >
            Annuler
          </button>
        </p>
      )}
      <ol className="reorganisation">
        {liste.map((b, i) => (
          <li key={`${b.id}-${i}-${b.debut}-${b.membres.map((m) => `${m.actifMin}.${m.passifMin ?? 0}`).join('-')}`} className="ligne-reorganisation">
            <div className="reorganisation-commandes">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={liste.length}
                defaultValue={i + 1}
                aria-label={`Numéro de l’étape ${i + 1}`}
                {...valider((v) => deplacer(b, Number(v)))}
              />
              <button type="button" className="bouton-rond" aria-label={`Monter l’étape ${i + 1}`} disabled={i === 0} onClick={() => deplacer(b, i)}>
                ↑
              </button>
              <button
                type="button"
                className="bouton-rond"
                aria-label={`Descendre l’étape ${i + 1}`}
                disabled={i === liste.length - 1}
                onClick={() => deplacer(b, i + 2)}
              >
                ↓
              </button>
              <input
                type="text"
                inputMode="decimal"
                className="champ-heure"
                defaultValue={b.debut}
                aria-label={`Heure de l’étape ${i + 1}`}
                {...valider((v) => modifier(() => changerHeure(session, origine, b.id, v), idsDe(b)))}
              />
            </div>
            <EnteteBloc bloc={b} sansHeure />
            {b.membres.map((m) =>
              enEdition === m.id ? (
                <EditeurEtape key={m.id} e={m} modifier={modifier} fermer={() => setEnEdition(null)} session={session} origine={origine} />
              ) : (
                <div key={m.id} className={`membre-reorganisation ${b.membres.length > 1 ? 'membre-fusion' : ''}`}>
                  <p className="etape-texte">
                    <TexteEtape texte={m.texte} />
                  </p>
                  {m.details && (
                    <ul className="etape-details">
                      {m.details.map((d, k) => (
                        <li key={k}>
                          <TexteEtape texte={d} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <Durees
                    e={m}
                    libelle={`étape ${i + 1}${b.membres.length > 1 ? ` (partie ${b.membres.indexOf(m) + 1})` : ''}`}
                    changer={(actif, passif) => modifier(() => changerDurees(session, origine, m.id, actif, passif), [m.id])}
                  />
                  {alertes.has(m.id) && <p className="texte-alerte petit">⚠ {alertes.get(m.id)}</p>}
                  <button
                    type="button"
                    className="bouton-lien"
                    aria-label={`Modifier l’étape ${i + 1}${b.membres.length > 1 ? ` (partie ${b.membres.indexOf(m) + 1})` : ''}`}
                    onClick={() => setEnEdition(m.id)}
                  >
                    ✎ Modifier
                  </button>
                </div>
              ),
            )}
            <div className="actions">
              {i < liste.length - 1 && (
                <button
                  type="button"
                  className="bouton-secondaire"
                  aria-label={`Fusionner l’étape ${i + 1} avec la suivante`}
                  onClick={() => modifier(() => fusionnerAvecSuivante(session, origine, b.id))}
                >
                  Fusionner avec la suivante
                </button>
              )}
              {b.membres.length > 1 && (
                <button
                  type="button"
                  className="bouton-secondaire"
                  aria-label={`Séparer l’étape ${i + 1}`}
                  onClick={() => modifier(() => separerFusion(session, origine, b.id))}
                >
                  Séparer
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {modifiee && (
        <button
          type="button"
          className="bouton-secondaire"
          onClick={() =>
            confirm('Annuler toutes les modifications des étapes de cette semaine (ordre, heures, textes, scissions, fusions) ?') &&
            void enregistrerPersonnalisation(plan.mois, semaine.numero, null)
          }
        >
          Revenir au plan importé
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
  /** Semaine avec les modifications faites dans l'app déjà appliquées. */
  semaine: Semaine;
  /** Session telle qu'importée (référence pour les modifications). */
  origine?: TypeSession;
  modifiee?: boolean;
}) {
  const reglages = useReglages();
  const prefixe = cles.prefixeEtapes(plan.mois, semaine.numero);
  const { coches } = useCochages(prefixe);
  const [reorganiser, setReorganiser] = useState(false);
  const a = aSortir(plan, semaine);
  const session = semaine.session;
  const cle = (id: string) => cles.etape(plan.mois, semaine.numero, id);
  const blocFait = (b: Bloc) => b.membres.every((m) => coches.has(cle(m.id)));
  const alertes = session && origine ? calculerIncoherences(session, origine) : new Map<string, string>();

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

      {session && !reorganiser && (
        <section className="carte">
          <h2>Planning</h2>
          <Gantt session={session} />
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
          {modifiee && <p className="bandeau-info">Étapes modifiées sur cet appareil.</p>}
          {reorganiser && origine ? (
            <Reorganisation plan={plan} semaine={semaine} session={session} origine={origine} modifiee={modifiee} />
          ) : (
            <>
              <p className="discret">
                {calculerBlocs(session).length} étapes · environ {formaterHeureSession(session.dureeMin ?? planning(session).finMin)}.
                L’heure compte depuis le début de la session.
              </p>
              {parTranches(calculerBlocs(session)).map((t) => (
                <div key={t.libelle}>
                  <h3 className="tranche">{t.libelle}</h3>
                  {t.blocs.map((b) => {
                    const fait = blocFait(b);
                    return (
                      <Case key={b.id} coche={fait} onChange={() => b.membres.forEach((m) => void cocher(cle(m.id), !fait))}>
                        <ContenuBloc bloc={b} session={session} reglages={reglages} alertes={alertes} />
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
