// Liste de courses de la semaine : quantités agrégées, triées par rayon, à cocher.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCochages } from '../app/hooks';
import { decocherTout, cles } from '../data/depot';
import { LIBELLES_RAYON } from '../domain/constantes';
import { coursesSemaine, texteQuantite, type LigneCalculee } from '../domain/courses';
import type { Plan, Semaine } from '../domain/schema/plan';
import { formaterQuantite } from '../domain/unites';
import { Case } from '../ui/composants';
import { OngletsSemaine } from './OngletsSemaine';

function Detail({ l }: { l: LigneCalculee }) {
  return (
    <ul className="detail">
      {l.provenances.map((p, i) => (
        <li key={i}>
          {p.origine} : {p.quantiteBase === null ? 'quantité non précisée' : formaterQuantite(p.quantiteBase, l.famille)}
        </li>
      ))}
    </ul>
  );
}

export function Courses({ plan, semaine }: { plan: Plan; semaine: Semaine }) {
  const rayons = coursesSemaine(plan, semaine);
  const prefixe = cles.prefixeCourses(plan.mois, semaine.numero);
  const { coches, basculer } = useCochages(prefixe);
  const [details, setDetails] = useState(false);
  const total = rayons.reduce((n, r) => n + r.lignes.length, 0);
  const faites = rayons.reduce((n, r) => n + r.lignes.filter((l) => coches.has(prefixe + l.cle)).length, 0);

  return (
    <>
      <OngletsSemaine plan={plan} semaine={semaine} vue="/courses" />
      <div className="barre-outils">
        <span>
          {faites} / {total} articles
        </span>
        <label className="interrupteur">
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Détail par recette
        </label>
        {faites > 0 && (
          <button type="button" className="bouton-secondaire" onClick={() => void decocherTout(prefixe)}>
            Tout décocher
          </button>
        )}
      </div>
      {rayons.map((r) => (
        <section key={r.rayon} className="carte">
          <h2>{LIBELLES_RAYON[r.rayon]}</h2>
          {r.lignes.map((l) => (
            <Case key={l.cle} coche={coches.has(prefixe + l.cle)} onChange={() => void basculer(prefixe + l.cle)}>
              <span className="ligne-courses">
                <span>{l.ingredient.nom}</span>
                <span className={`quantite ${l.incomplete ? 'quantite-incomplete' : ''}`}>{texteQuantite(l)}</span>
              </span>
              {details && <Detail l={l} />}
            </Case>
          ))}
        </section>
      ))}
      <p className="discret note">
        Produits de placard non inclus : <Link to="/placard">voir le placard du mois</Link>. « Quantité non précisée » : le
        plan importé ne donne pas la quantité, l’app ne l’estime pas.
      </p>
    </>
  );
}
