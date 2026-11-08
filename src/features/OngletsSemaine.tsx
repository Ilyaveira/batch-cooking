// Onglets en haut des écrans d'une semaine + passage d'une semaine à l'autre.
import { Link, NavLink } from 'react-router-dom';
import { dateLongue } from '../domain/dates';
import type { Plan, Semaine } from '../domain/schema/plan';

export function OngletsSemaine({ plan, semaine, vue }: { plan: Plan; semaine: Semaine; vue: '' | '/courses' | '/session' }) {
  const i = plan.semaines.indexOf(semaine);
  const prec = plan.semaines[i - 1];
  const suiv = plan.semaines[i + 1];
  const base = `/semaine/${semaine.numero}`;
  return (
    <header className="entete">
      <div className="navigation-semaines">
        {prec ? (
          <Link to={`/semaine/${prec.numero}${vue}`} aria-label={`Semaine ${prec.numero}`}>
            ‹
          </Link>
        ) : (
          <span />
        )}
        <h1>
          Semaine {semaine.numero}
          <span className="sous-titre">{dateLongue(semaine.dateSession)}</span>
        </h1>
        {suiv ? (
          <Link to={`/semaine/${suiv.numero}${vue}`} aria-label={`Semaine ${suiv.numero}`}>
            ›
          </Link>
        ) : (
          <span />
        )}
      </div>
      <nav className="onglets" aria-label="Vues de la semaine">
        <NavLink to={base} end>
          Repas
        </NavLink>
        <NavLink to={`${base}/courses`}>Courses</NavLink>
        <NavLink to={`${base}/session`}>Session</NavLink>
      </nav>
    </header>
  );
}
