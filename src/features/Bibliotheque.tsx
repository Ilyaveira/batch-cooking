// Bibliothèque de recettes : recherche et filtres par tags.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { FECULENTS, LIBELLES_FECULENT, LIBELLES_SAISON, SAISONS, type Feculent, type Saison } from '../domain/constantes';
import { moisLong } from '../domain/dates';
import { normaliser } from '../domain/exclusions';
import { EnChargement } from '../ui/composants';

export function Bibliotheque() {
  const recettes = useLiveQuery(() => db.recettes.toArray());
  const [texte, setTexte] = useState('');
  const [vegetarien, setVegetarien] = useState(false);
  const [feculent, setFeculent] = useState<Feculent | ''>('');
  const [saison, setSaison] = useState<Saison | ''>('');
  if (recettes === undefined) return <EnChargement />;

  const recherche = normaliser(texte).join(' ');
  const liste = recettes
    .filter((r) => !r.supprimeLe)
    .filter(({ recette: r, ingredients }) => {
      if (vegetarien && !r.tags?.vegetarien) return false;
      if (feculent && !r.tags?.feculents?.includes(feculent)) return false;
      if (saison && !r.tags?.saisons?.includes(saison)) return false;
      if (!recherche) return true;
      const cible = normaliser([r.nom, ...ingredients.map((i) => i.nom), ...(r.tags?.libres ?? [])].join(' ')).join(' ');
      return cible.includes(recherche);
    })
    .sort((a, b) => a.recette.nom.localeCompare(b.recette.nom, 'fr'));

  return (
    <>
      <header className="entete">
        <h1>Recettes</h1>
        <p className="discret">{recettes.length} recettes, issues des plans importés</p>
      </header>
      <div className="filtres">
        <input
          type="search"
          placeholder="Rechercher un plat ou un ingrédient"
          aria-label="Rechercher"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
        />
        <label className="interrupteur">
          <input type="checkbox" checked={vegetarien} onChange={(e) => setVegetarien(e.target.checked)} /> Végétarien
        </label>
        <select aria-label="Féculent" value={feculent} onChange={(e) => setFeculent(e.target.value as Feculent | '')}>
          <option value="">Tous les féculents</option>
          {FECULENTS.map((f) => (
            <option key={f} value={f}>
              {LIBELLES_FECULENT[f]}
            </option>
          ))}
        </select>
        <select aria-label="Saison" value={saison} onChange={(e) => setSaison(e.target.value as Saison | '')}>
          <option value="">Toutes saisons</option>
          {SAISONS.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_SAISON[s]}
            </option>
          ))}
        </select>
      </div>
      {liste.length === 0 && <p className="discret">Aucune recette ne correspond.</p>}
      <ul className="liste-recettes">
        {liste.map(({ recette: r, moisOrigine }) => (
          <li key={r.id}>
            <Link to={`/recettes/${r.id}`} className="carte lien-carte">
              <strong>{r.nom}</strong>
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
              </span>
              <span className="discret petit">
                {r.portions} portions · plan de {moisLong(moisOrigine)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
