// Fiche recette : portions ajustables (quantités recalculées), four, ustensiles, étapes.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useReglages } from '../app/hooks';
import { db } from '../data/db';
import { LIBELLES_FECULENT, LIBELLES_SAISON } from '../domain/constantes';
import { conservationRecette } from '../domain/calendrier';
import { ingredientsPourPortions } from '../domain/portions';
import { temperatureAffichee } from '../domain/reglages';
import { formaterQuantiteUnite } from '../domain/unites';
import { EnChargement } from '../ui/composants';
import { SectionNotes } from './Notes';

export function FicheRecette() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const enreg = useLiveQuery(() => db.recettes.get(id ?? ''), [id]);
  const reglages = useReglages();
  const [portions, setPortions] = useState<number | null>(null);
  if (enreg === undefined) return <EnChargement />;
  if (!enreg)
    return (
      <p>
        Recette introuvable. <Link to="/recettes">Retour aux recettes</Link>
      </p>
    );

  const r = enreg.recette;
  const nb = portions ?? (Number(params.get('portions')) || r.portions);
  const ingredients = new Map(enreg.ingredients.map((i) => [i.id, i]));
  const lignes = ingredientsPourPortions(r, nb);
  const conservation = conservationRecette(r, reglages);
  const four = r.four ? temperatureAffichee(r.four.temperatureC, r.four.mode, reglages.four) : null;

  return (
    <>
      <header className="entete">
        <Link to="/recettes" className="discret">
          ‹ Recettes
        </Link>
        <h1>{r.nom}</h1>
        <span className="etiquettes">
          {r.tags?.vegetarien && <span className="etiquette">végétarien</span>}
          {r.tags?.feculents?.map((f) => (
            <span key={f} className="etiquette">
              {LIBELLES_FECULENT[f]}
            </span>
          ))}
          {r.tags?.saisons?.map((s) => (
            <span key={s} className="etiquette">
              {LIBELLES_SAISON[s]}
            </span>
          ))}
          {r.tags?.libres?.map((t) => (
            <span key={t} className="etiquette">
              {t}
            </span>
          ))}
        </span>
      </header>

      <section className="carte">
        <div className="portions">
          <button type="button" className="bouton-rond" aria-label="Une portion de moins" onClick={() => setPortions(Math.max(1, nb - 1))}>
            −
          </button>
          <span aria-live="polite">
            <strong>{nb}</strong> portion{nb > 1 ? 's' : ''}
          </span>
          <button type="button" className="bouton-rond" aria-label="Une portion de plus" onClick={() => setPortions(nb + 1)}>
            +
          </button>
        </div>
        {nb !== r.portions && <p className="discret petit">Recette écrite pour {r.portions} portions ; quantités recalculées.</p>}
        <ul className="liste-ingredients">
          {lignes.map((l, i) => (
            <li key={i}>
              <span>
                {ingredients.get(l.ingredient)?.nom ?? l.ingredient}
                {l.facultatif && <span className="discret"> (facultatif)</span>}
                {l.note && <span className="discret"> — {l.note}</span>}
              </span>
              <span className={`quantite ${l.quantite === null ? 'quantite-incomplete' : ''}`}>
                {l.quantite === null ? 'non précisée' : formaterQuantiteUnite(l.quantite, l.unite)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="carte">
        <dl className="infos">
          {four && r.four && (
            <>
              <dt>Four</dt>
              <dd>
                {four.valeurC} °C {reglages.four.mode === 'chaleur-tournante' ? 'chaleur tournante' : 'traditionnel'}
                {four.ajustee && (
                  <span className="discret">
                    {' '}
                    (recette : {r.four.temperatureC} °C {r.four.mode === 'traditionnel' ? 'traditionnel' : 'chaleur tournante'})
                  </span>
                )}
              </dd>
            </>
          )}
          {r.durees?.preparationMin !== undefined && (
            <>
              <dt>Préparation</dt>
              <dd>{r.durees.preparationMin} min</dd>
            </>
          )}
          {r.durees?.cuissonMin !== undefined && (
            <>
              <dt>Cuisson</dt>
              <dd>{r.durees.cuissonMin} min</dd>
            </>
          )}
          {r.ustensiles && (
            <>
              <dt>Ustensiles</dt>
              <dd>{r.ustensiles.join(', ')}</dd>
            </>
          )}
          <dt>Conservation</dt>
          <dd>
            {conservation.type ? (
              <>
                {conservation.type.libelle} : {conservation.type.joursMin === conservation.type.joursMax ? '' : `${conservation.type.joursMin} à `}
                {conservation.type.joursMax} jours
                {conservation.type.source && (
                  <>
                    {' '}
                    (
                    <a href={conservation.type.source.url} target="_blank" rel="noreferrer">
                      {conservation.type.source.libelle}
                    </a>
                    )
                  </>
                )}
              </>
            ) : (
              <span className="discret">non renseignée</span>
            )}
            {conservation.clesInconnues.length > 0 && (
              <span className="texte-alerte"> · type inconnu des réglages : {conservation.clesInconnues.join(', ')}</span>
            )}
          </dd>
          {r.source && (
            <>
              <dt>Source</dt>
              <dd>{/^https?:\/\//.test(r.source) ? <a href={r.source}>{r.source}</a> : r.source}</dd>
            </>
          )}
        </dl>
      </section>

      <SectionNotes recetteId={r.id} />

      {r.etapes && (
        <section className="carte">
          <h2>Étapes</h2>
          <ol className="etapes-recette">
            {r.etapes.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
