// Bibliothèque de recettes : recherche, filtres (tags, étiquettes nutritionnelles, notes) et tri.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { FECULENTS, LIBELLES_FECULENT, LIBELLES_SAISON, SAISONS, type Feculent, type Saison } from '../domain/constantes';
import { moisLong } from '../domain/dates';
import { normaliser } from '../domain/exclusions';
import { filtrerParNote, formaterMoyenne, resumerNotes, trierRecettes, type CritereTri, type FiltreNote } from '../domain/notation';
import { listerInfosIngredients, listerNotes } from '../data/depot';
import { useCiqual, useEtiquettesPerso, useReglages } from '../app/hooks';
import { appliquerEtiquettes } from '../domain/bibliotheque';
import { appliquerInfosIngredient } from '../domain/modifications';
import { etiquettesNutrition, etiquettesObtenues, nutritionRecette, type CleEtiquette } from '../domain/nutrition';
import { EnChargement } from '../ui/composants';

export function Bibliotheque() {
  const recettes = useLiveQuery(() => db.recettes.toArray());
  const notes = useLiveQuery(() => listerNotes());
  const infos = useLiveQuery(() => listerInfosIngredients());
  const etiquettesPerso = useEtiquettesPerso();
  const table = useCiqual();
  const reglages = useReglages();
  const [nutri, setNutri] = useState<CleEtiquette | ''>('');
  const [tri, setTri] = useState<CritereTri>('nom');
  const [filtreNote, setFiltreNote] = useState<FiltreNote>('toutes');
  const [texte, setTexte] = useState('');
  const [vegetarien, setVegetarien] = useState(false);
  const [feculent, setFeculent] = useState<Feculent | ''>('');
  const [saison, setSaison] = useState<Saison | ''>('');
  if (recettes === undefined || notes === undefined || infos === undefined || etiquettesPerso === undefined) return <EnChargement />;
  const resumes = resumerNotes(notes);
  const ciqual = table && !(table instanceof Error) ? table : null;
  // Recettes avec leurs étiquettes modifiées et leurs étiquettes nutritionnelles calculées.
  const enrichies = recettes
    .filter((r) => !r.supprimeLe)
    .map((e) => {
      const recette = appliquerEtiquettes(e.recette, etiquettesPerso.get(e.id));
      const nutrition = ciqual
        ? etiquettesObtenues(
            etiquettesNutrition(
              nutritionRecette(recette, new Map(e.ingredients.map((i) => [i.id, appliquerInfosIngredient(i, infos.find((x) => x.id === i.id))])), ciqual, []).total,
              reglages.nutrition.seuilGlucidesPct,
            ),
          )
        : [];
      return { ...e, recette, nutrition };
    });

  const recherche = normaliser(texte).join(' ');
  const liste = enrichies
    .filter((r) => !nutri || r.nutrition.some((x) => x.cle === nutri || (nutri === 'source-proteines' && x.cle === 'riche-proteines') || (nutri === 'source-fibres' && x.cle === 'riche-fibres')))
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
        <p className="discret petit">
          Étiquettes nutritionnelles calculées depuis Ciqual 2025 avec les seuils du règlement (CE) 1924/2006 ; une recette dont des
          ingrédients ne sont pas comptés ne les obtient pas (détail sur sa fiche).
        </p>
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
        <select aria-label="Étiquette nutritionnelle" value={nutri} onChange={(e) => setNutri(e.target.value as CleEtiquette | '')} disabled={!ciqual}>
          <option value="">Toutes les étiquettes nutritionnelles</option>
          <option value="riche-proteines">Riche en protéines</option>
          <option value="source-proteines">Source de protéines (ou riche)</option>
          <option value="riche-fibres">Riche en fibres</option>
          <option value="source-fibres">Source de fibres (ou riche)</option>
          <option value="pauvre-lipides">Pauvre en matières grasses</option>
          <option value="pauvre-ags">Pauvre en graisses saturées</option>
          <option value="pauvre-sucres">Pauvre en sucres</option>
          <option value="pauvre-sel">Pauvre en sel</option>
          <option value="pauvre-glucides">Pauvre en glucides (seuil personnel)</option>
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
        {triees.map(({ recette: r, moisOrigine, nutrition }) => (
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
                {r.tags?.libres?.map((t) => (
                  <span key={t} className="etiquette">
                    {t}
                  </span>
                ))}
                {nutrition.map((x) => (
                  <span key={x.cle} className="etiquette etiquette-nutrition">
                    {x.libelle}
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
