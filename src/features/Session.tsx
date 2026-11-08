// Organisation de la session : « à sortir », puis les étapes dans l'ordre chronologique.
import { Link } from 'react-router-dom';
import { useCochages, useReglages } from '../app/hooks';
import { cles } from '../data/depot';
import { LIBELLES_STOCKAGE } from '../domain/constantes';
import { texteQuantite } from '../domain/courses';
import { formaterHeureSession, minutesDepuisDebut } from '../domain/dates';
import type { EtapeSession, Plan, Semaine } from '../domain/schema/plan';
import { aSortir, etapesTriees, planning } from '../domain/session';
import { Case } from '../ui/composants';
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

export function Session({ plan, semaine }: { plan: Plan; semaine: Semaine }) {
  const reglages = useReglages();
  const prefixe = cles.prefixeEtapes(plan.mois, semaine.numero);
  const { coches, basculer } = useCochages(prefixe);
  const a = aSortir(plan, semaine);
  const session = semaine.session;

  return (
    <>
      <OngletsSemaine plan={plan} semaine={semaine} vue="/session" />
      {session && (
        <Link className="bouton bouton-large" to={`/semaine/${semaine.numero}/cuisine`}>
          Passer en mode cuisine
        </Link>
      )}

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

      {!session ? (
        <p className="discret">Ce plan ne contient pas de déroulé de session pour cette semaine.</p>
      ) : (
        <section className="carte">
          <h2>Étapes</h2>
          <p className="discret">
            {session.etapes.length} étapes · environ {formaterHeureSession(session.dureeMin ?? planning(session).finMin)}. L’heure
            compte depuis le début de la session.
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
        </section>
      )}
    </>
  );
}
