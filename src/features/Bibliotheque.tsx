// Bibliothèque de recettes : recherche, filtres (tags, notes) et tri (nom, goût, facilité, récence).
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { FECULENTS, LIBELLES_FECULENT, LIBELLES_SAISON, SAISONS, type Feculent, type Saison } from '../domain/constantes';
import { moisLong } from '../domain/dates';
import { normaliser } from '../domain/exclusions';
import { filtrerParNote, formaterMoyenne, resumerNotes, trierRecettes, type CritereTri, type FiltreNote } from '../domain/notation';
import { listerNotes } from '../data/depot';
import { EnChargement } from '../ui/composants';

export function Bibliotheque() {
  const recettes = useLiveQuery(() => db.recettes.toArray());
  const notes = useLiveQuery(() => listerNotes());
  const [tri, setTri] = useState<CritereTri>('nom');
  const [filtreNote, setFiltreNote] = useState<FiltreNote>('toutes');
  const [texte, setTexte] = useState('');
  const [vegetarien, setVegetarien] = useState(false);
  const [feculent, setFeculent] = useState<Feculent | ''>('');
  const [saison, setSaison] = useState<Saison | ''>('');
  if (recettes === undefined || notes === undefined) return <EnChargement />;
  const resumes = resumerNotes(notes);

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
    .filter((r) => filtrerParNote(resumes.get(r.id), filtreNote));
  const triees = trierRecettes(
    liste.map((r) => ({ ...r, nom: r.recette.nom })),
    resumes,
    tri,
  );

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
        <select aria-label="Note" value={filtreNote} onChange={(e) => setFiltreNote(e.target.value as FiltreNote)}>
          <option value="toutes">Toutes les notes</option>
          <option value="gout5">Goût 5 ★</option>
          <option value="gout4">Goût ≥ 4 ★</option>
          <option value="gout3">Goût ≥ 3 ★</option>
          <option value="jamais">Jamais notées</option>
        </select>
        <select aria-label="Trier par" value={tri} onChange={(e) => setTri(e.target.value as CritereTri)}>
          <option value="nom">Trier par nom</option>
          <option value="gout">Trier par goût</option>
          <option value="facilite">Trier par facilité</option>
          <option value="recent">Dernière fois cuisinée</option>
        </select>
      </div>
      {triees.length === 0 && <p className="discret">Aucune recette ne correspond.</p>}
      <ul className="liste-recettes">
        {triees.map(({ recette: r, moisOrigine }) => (
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
              <span className="petit">
                {resumes.get(r.id) ? (
                  <>
                    Goût <strong>{formaterMoyenne(resumes.get(r.id)!.gout)}</strong> ★ · facilité{' '}
                    <strong>{formaterMoyenne(resumes.get(r.id)!.facilite)}</strong> ★ · {resumes.get(r.id)!.nb} note
                    {resumes.get(r.id)!.nb > 1 ? 's' : ''}
                  </>
                ) : (
                  <span className="discret">Pas encore notée</span>
                )}
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
