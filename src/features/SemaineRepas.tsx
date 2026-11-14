// « Quand manger quoi » : repas du dimanche soir au dernier jour réglé, vérifiés contre
// les durées de conservation des réglages.
import { Link } from 'react-router-dom';
import { useReglages } from '../app/hooks';
import { calendrierSemaine, type EntreeRepas } from '../domain/calendrier';
import { dateLongue } from '../domain/dates';
import type { Plan, Semaine } from '../domain/schema/plan';
import { PastilleStatut } from '../ui/composants';
import { nomsPersonnes } from './Accueil';
import { OngletsSemaine } from './OngletsSemaine';

function Repas({ plan, e, semaine }: { plan: Plan; e: EntreeRepas; semaine: number }) {
  const t = e.conservation.type;
  const tous = e.pour.length === plan.personnes.length;
  return (
    <li className={`repas repas-${e.statut}`}>
      <div className="repas-titre">
        <Link to={`/recettes/${e.recette.id}?semaine=${semaine}`}>{e.recette.nom}</Link>
        <PastilleStatut statut={e.statut} jours={e.jours} />
      </div>
      <p className="discret">
        {e.portions} portion{e.portions > 1 ? 's' : ''}
        {!tous && ` · pour ${nomsPersonnes(plan, e.pour)}`}
        {t && ` · ${t.libelle} : ${t.joursMin === t.joursMax ? t.joursMax : `${t.joursMin} à ${t.joursMax}`} j`}
        {t?.source && (
          <>
            {' '}
            (<a href={t.source.url} target="_blank" rel="noreferrer">
              {t.source.libelle.split(' — ')[0]}
            </a>
            )
          </>
        )}
        {e.conservation.clesInconnues.length > 0 && ` · type inconnu des réglages : ${e.conservation.clesInconnues.join(', ')}`}
      </p>
      {e.aPreparer && (
        <p className="a-preparer">
          <strong>À préparer{e.aPreparerMin ? ` (${e.aPreparerMin} min)` : ''} :</strong> {e.aPreparer}
        </p>
      )}
    </li>
  );
}

export function SemaineRepas({ plan, semaine }: { plan: Plan; semaine: Semaine }) {
  const reglages = useReglages();
  const { jours, horsDelai } = calendrierSemaine(plan, semaine, reglages);
  return (
    <>
      <OngletsSemaine plan={plan} semaine={semaine} vue="" />
      {horsDelai.length > 0 && (
        <div className="alerte" role="alert">
          {horsDelai.map((e, i) => (
            <p key={i}>
              ⚠ {e.recette.nom}, {dateLongue(e.date)} {e.moment} : J+{e.jours}, au-delà de {e.conservation.type!.joursMax} j (
              {e.conservation.type!.libelle}).
            </p>
          ))}
          <p className="discret">Les durées se modifient dans Réglages.</p>
        </div>
      )}
      {jours.map((j) => {
        const vide = j.repas.midi.length + j.repas.soir.length === 0;
        return (
          <section key={j.date} className="carte jour">
            <h2>
              {dateLongue(j.date)} <span className="discret">J+{j.jours}</span>
            </h2>
            {vide && <p className="discret">Libre</p>}
            {(['midi', 'soir'] as const).map(
              (moment) =>
                j.repas[moment].length > 0 && (
                  <div key={moment}>
                    <h3>{moment === 'midi' ? 'Midi' : 'Soir'}</h3>
                    <ul className="liste-repas">
                      {j.repas[moment].map((e, i) => (
                        <Repas key={i} plan={plan} e={e} semaine={semaine.numero} />
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </section>
        );
      })}
      <p className="discret note">
        J0 = jour de la session. Vert : jusqu’à la borne basse ; orange : entre les bornes ; rouge : au-delà. Les durées et
        leurs sources sont dans Réglages.
      </p>
    </>
  );
}
