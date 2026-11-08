// Placard du mois : à vérifier une fois, avant la première session.
import { useCochages, usePlanActif } from '../app/hooks';
import { cles, decocherTout } from '../data/depot';
import { placardMois, texteQuantite } from '../domain/courses';
import { moisLong } from '../domain/dates';
import { AucunPlan, Case, EnChargement } from '../ui/composants';

export function Placard() {
  const { plan } = usePlanActif();
  const prefixe = plan ? cles.prefixePlacard(plan.mois) : '-';
  const { coches, basculer } = useCochages(prefixe);
  if (plan === undefined) return <EnChargement />;
  if (plan === null) return <AucunPlan />;
  const lignes = placardMois(plan);

  return (
    <>
      <header className="entete">
        <h1>Placard</h1>
        <p className="discret">{moisLong(plan.mois)} · à vérifier une fois par mois</p>
      </header>
      <div className="barre-outils">
        <span>
          {lignes.filter((l) => coches.has(cles.placard(plan.mois, l.ingredient.id))).length} / {lignes.length} vérifiés
        </span>
        <button type="button" className="bouton-secondaire" onClick={() => void decocherTout(prefixe)}>
          Tout décocher
        </button>
      </div>
      <section className="carte">
        {lignes.map((l) => {
          const cle = cles.placard(plan.mois, l.ingredient.id);
          const utilise = l.utiliseCeMois.map(texteQuantite).join(' + ');
          return (
            <Case key={l.ingredient.id} coche={coches.has(cle)} onChange={() => void basculer(cle)}>
              <span className="ligne-courses">
                <span>
                  {l.ingredient.nom}
                  {l.note && <span className="discret"> ({l.note})</span>}
                </span>
                {l.prevu && <span className="quantite">{l.prevu}</span>}
              </span>
              {utilise && (
                <span className="discret petit">
                  Utilisé ce mois : {utilise} (semaine{l.semaines.length > 1 ? 's' : ''} {l.semaines.join(', ')})
                </span>
              )}
            </Case>
          );
        })}
      </section>
    </>
  );
}
