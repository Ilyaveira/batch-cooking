// Plan du mois : les semaines, leurs plats (portions, plats en double) et les alertes.
import { Link } from 'react-router-dom';
import { usePlanActif, usePlans, useReglages } from '../app/hooks';
import { calendrierSemaine } from '../domain/calendrier';
import { dateLongue, moisLong } from '../domain/dates';
import { alertesExclusions } from '../domain/exclusions';
import type { Plan } from '../domain/schema/plan';
import { AucunPlan, EnChargement } from '../ui/composants';

export function nomsPersonnes(plan: Plan, ids: string[] | undefined): string | null {
  if (!ids) return null;
  return ids.map((id) => plan.personnes.find((p) => p.id === id)?.nom ?? id).join(', ');
}

export function Accueil() {
  const { plan, choisir } = usePlanActif();
  const plans = usePlans();
  const reglages = useReglages();
  if (plan === undefined) return <EnChargement />;
  if (plan === null)
    return (
      <>
        <h1>Batch cooking</h1>
        <AucunPlan />
      </>
    );

  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  const exclusions = alertesExclusions(plan, reglages.personnes);

  return (
    <>
      <header className="entete">
        <h1>{plan.titre}</h1>
        <p className="discret">{moisLong(plan.mois)}</p>
        {plans && plans.length > 1 && (
          <label className="champ">
            Mois affiché
            <select value={plan.mois} onChange={(e) => choisir(e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {moisLong(p.id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {exclusions.length > 0 && (
        <div className="alerte" role="alert">
          <strong>Aliments exclus repérés :</strong>
          <ul>
            {exclusions.map((a, i) => (
              <li key={i}>
                Semaine {a.semaine}, {a.recette} : {a.ingredient} ({a.personne} exclut « {a.exclusion} »)
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link to="/placard" className="carte lien-carte">
        <strong>Placard du mois</strong>
        <span className="discret">À vérifier une fois, avant la première session</span>
      </Link>

      {plan.semaines.map((s) => {
        const { horsDelai } = calendrierSemaine(plan, s, reglages);
        return (
          <section key={s.numero} className="carte">
            <h2>
              Semaine {s.numero} · {dateLongue(s.dateSession)}
            </h2>
            {s.titre && <p className="discret">{s.titre}</p>}
            <ul className="liste-plats">
              {s.plats.map((p, i) => {
                const r = recettes.get(p.recette)!;
                const pour = nomsPersonnes(plan, p.pour);
                return (
                  <li key={i}>
                    <Link to={`/recettes/${r.id}?portions=${p.portions}`}>{r.nom}</Link>
                    <span className="etiquettes">
                      <span className="etiquette">{p.portions} portions</span>
                      {(p.repas?.length ?? 0) >= 2 && <span className="etiquette etiquette-double">en double</span>}
                      {pour && <span className="etiquette">pour {pour}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {horsDelai.length > 0 && (
              <p className="texte-alerte">
                ⚠ {horsDelai.length} repas au-delà de la durée de conservation réglée
              </p>
            )}
            <div className="actions">
              <Link className="bouton-secondaire" to={`/semaine/${s.numero}`}>
                Quand manger quoi
              </Link>
              <Link className="bouton-secondaire" to={`/semaine/${s.numero}/courses`}>
                Courses
              </Link>
              <Link className="bouton-secondaire" to={`/semaine/${s.numero}/session`}>
                Session
              </Link>
            </div>
          </section>
        );
      })}
    </>
  );
}
