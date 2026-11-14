// Éditeur des ingrédients d'une recette : quantités, unités, notes, retirer, remplacer, ajouter.
// À l'enregistrement : pour cette semaine seulement, pour tout le mois (+ bibliothèque), ou pour
// la bibliothèque si la recette n'est pas dans le plan affiché.
import { useState } from 'react';
import { usePlanActif } from '../app/hooks';
import {
  enregistrerInfosIngredient,
  enregistrerRecettePerso,
  enregistrerRecettesPerso,
  modifierRecetteBibliotheque,
} from '../data/depot';
import { LIBELLES_RAYON, LIBELLES_UNITE, RAYONS, UNITES, type Rayon, type Unite } from '../domain/constantes';
import { normaliser } from '../domain/exclusions';
import {
  creerIdIngredient,
  ErreurModification,
  etapesCitant,
  lireQuantite,
  planDeSemaine,
  recettesDeSemaine,
  remplacerDansRecettes,
  remplacerIngredient,
  verifierLignes,
  type RecettePerso,
} from '../domain/modifications';
import type { Ingredient, LigneIngredient, Plan, Recette, Semaine } from '../domain/schema/plan';


export type Portee = 'semaine' | 'mois' | 'bibliotheque';

type LigneSaisie = { ingredient: string; quantite: string; unite: Unite; note: string; facultatif?: boolean };

const versSaisie = (l: LigneIngredient): LigneSaisie => ({
  ingredient: l.ingredient,
  quantite: l.quantite === null ? '' : String(Math.round(l.quantite * 100) / 100).replace('.', ','),
  unite: l.unite,
  note: l.note ?? '',
  facultatif: l.facultatif,
});

/** Choisir un ingrédient du catalogue (recherche) ou en créer un nouveau. */
function ChoixIngredient({
  catalogue,
  choisir,
  annuler,
  titre,
}: {
  catalogue: Ingredient[];
  choisir: (id: string, cree?: Ingredient) => void;
  annuler: () => void;
  titre: string;
}) {
  const [texte, setTexte] = useState('');
  const [rayon, setRayon] = useState<Rayon>('fruits-legumes');
  const cible = normaliser(texte).join(' ');
  const trouves = cible ? catalogue.filter((i) => normaliser(i.nom).join(' ').includes(cible)).slice(0, 8) : [];
  const creer = () => {
    const nom = texte.trim();
    if (!nom) return;
    const id = creerIdIngredient(nom, new Set(catalogue.map((i) => i.id)));
    choisir(id, { id, nom: nom.charAt(0).toUpperCase() + nom.slice(1), rayon });
  };
  return (
    <div className="choix-ingredient">
      <label className="champ">
        {titre}
        <input type="search" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="ex. potimarron" autoFocus />
      </label>
      <ul className="liste-simple">
        {trouves.map((i) => (
          <li key={i.id}>
            <button type="button" className="bouton-lien" onClick={() => choisir(i.id)}>
              {i.nom}
            </button>
          </li>
        ))}
      </ul>
      {texte.trim() && !trouves.some((i) => normaliser(i.nom).join(' ') === cible) && (
        <div className="creer-ingredient">
          <span>
            Créer « {texte.trim()} » au rayon{' '}
            <select aria-label="Rayon du nouvel ingrédient" value={rayon} onChange={(e) => setRayon(e.target.value as Rayon)}>
              {RAYONS.map((r) => (
                <option key={r} value={r}>
                  {LIBELLES_RAYON[r]}
                </option>
              ))}
            </select>
          </span>
          <button type="button" className="bouton-secondaire" onClick={creer}>
            Créer
          </button>
        </div>
      )}
      <button type="button" className="bouton-lien" onClick={annuler}>
        Annuler
      </button>
    </div>
  );
}

export function EditeurIngredients({
  recette,
  catalogue,
  portees,
  planMois,
  semaine,
  fermer,
}: {
  recette: Recette;
  catalogue: Ingredient[];
  /** Portées proposées, la première étant celle par défaut. */
  portees: Portee[];
  /** Plan effectif du mois (si la recette en fait partie). */
  planMois?: Plan;
  /** Semaine d'où l'on vient (pour la portée « cette semaine »). */
  semaine?: Semaine;
  fermer: () => void;
}) {
  const { infos, recettesPerso } = usePlanActif();
  const [lignes, setLignes] = useState<LigneSaisie[]>(recette.ingredients.map(versSaisie));
  const [crees, setCrees] = useState<Ingredient[]>([]);
  const [remplacements, setRemplacements] = useState<{ ancien: string; nouveau: string }[]>([]);
  const [partout, setPartout] = useState(false);
  const [choix, setChoix] = useState<{ mode: 'ajouter' } | { mode: 'remplacer'; index: number } | null>(null);
  const [portee, setPortee] = useState<Portee>(portees[0]!);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<string[] | null>(null);
  const tous = [...catalogue, ...crees];
  const nomDe = (id: string) => tous.find((i) => i.id === id)?.nom ?? id;
  const maj = (i: number, l: Partial<LigneSaisie>) => setLignes(lignes.map((x, k) => (k === i ? { ...x, ...l } : x)));

  const choisirIngredient = (id: string, cree?: Ingredient) => {
    if (cree) setCrees([...crees, cree]);
    if (choix?.mode === 'ajouter') setLignes([...lignes, { ingredient: id, quantite: '', unite: 'g', note: '' }]);
    if (choix?.mode === 'remplacer') {
      const ancien = lignes[choix.index]!.ingredient;
      maj(choix.index, { ingredient: id });
      if (ancien !== id) setRemplacements([...remplacements, { ancien, nouveau: id }]);
    }
    setChoix(null);
  };

  const enregistrer = async () => {
    try {
      const finales: LigneIngredient[] = lignes.map((l, i) => {
        const q = lireQuantite(l.quantite);
        if (q === 'invalide') throw new ErreurModification(`Ligne ${i + 1} : quantité attendue supérieure à 0 (ou vide si elle n’est pas connue).`);
        return {
          ingredient: l.ingredient,
          quantite: q,
          unite: l.unite,
          ...(l.note.trim() ? { note: l.note.trim() } : {}),
          ...(l.facultatif ? { facultatif: true } : {}),
        };
      });
      verifierLignes(finales, new Set(tous.map((i) => i.id)));
      // Les ingrédients créés sont mémorisés (catalogue de l'app, pour tous les mois).
      for (const c of crees.filter((c) => finales.some((l) => l.ingredient === c.id)))
        await enregistrerInfosIngredient({ id: c.id, nom: c.nom, rayon: c.rayon, cree: true });

      const messages: string[] = [];
      if (portee === 'bibliotheque' || !planMois) {
        await modifierRecetteBibliotheque(recette.id, finales, [...infos, ...crees.map((c) => ({ id: c.id, nom: c.nom, rayon: c.rayon, cree: true }))]);
        messages.push('Recette de la bibliothèque modifiée.');
      } else {
        const numero = portee === 'semaine' && semaine ? semaine.numero : 0;
        await enregistrerRecettePerso(planMois.mois, numero, recette.id, finales);
        if (numero === 0) await modifierRecetteBibliotheque(recette.id, finales, [...infos, ...crees.map((c) => ({ id: c.id, nom: c.nom, rayon: c.rayon, cree: true }))]);
        messages.push(numero ? `Modifiée pour la semaine ${numero} seulement.` : 'Modifiée pour tout le mois (et la bibliothèque).');

        // Remplacements à reporter dans les autres recettes de la même portée.
        if (partout && remplacements.length) {
          const base = numero && semaine ? planDeSemaine(planMois, semaine, recettesPerso).plan : planMois;
          const autres = (numero && semaine ? recettesDeSemaine(semaine) : base.recettes.map((r) => r.id)).filter((id) => id !== recette.id);
          let courant = base;
          const parRecette = new Map<string, RecettePerso>();
          for (const { ancien, nouveau } of remplacements) {
            for (const p of remplacerDansRecettes(courant, ancien, nouveau, autres, numero)) {
              parRecette.set(p.recetteId, p);
              courant = { ...courant, recettes: courant.recettes.map((r) => (r.id === p.recetteId ? { ...r, ingredients: p.ingredients } : r)) };
            }
          }
          await enregistrerRecettesPerso([...parRecette.values()]);
          if (parRecette.size)
            messages.push(`Remplacé aussi dans : ${[...parRecette.keys()].map((id) => base.recettes.find((r) => r.id === id)?.nom ?? id).join(', ')}.`);
        }
        // Modification pour le mois : les versions « semaine » existantes restent prioritaires.
        // Les remplacements leur sont aussi appliqués (pour cette recette, ou toutes si « partout »).
        if (numero === 0) {
          const semaines = recettesPerso.filter((p) => p.semaine > 0 && (p.recetteId === recette.id || partout));
          const majSemaines = semaines
            .map((p) => ({ ...p, ingredients: remplacements.reduce((ls, { ancien, nouveau }) => remplacerIngredient(ls, ancien, nouveau), p.ingredients) }))
            .filter((p, i) => p.ingredients !== semaines[i]!.ingredients);
          if (majSemaines.length) await enregistrerRecettesPerso(majSemaines);
          const prioritaires = recettesPerso.filter((p) => p.semaine > 0 && p.recetteId === recette.id).map((p) => p.semaine);
          if (prioritaires.length)
            messages.push(
              `La version modifiée pour la semaine ${prioritaires.join(', ')} reste prioritaire sur cette semaine${remplacements.length ? ' (les remplacements y ont été reportés)' : ''}.`,
            );
        }
        for (const { ancien } of remplacements) {
          const cites = etapesCitant(planMois, nomDe(ancien), numero ? [numero] : undefined);
          if (cites.length)
            messages.push(`Les étapes de session citent encore « ${nomDe(ancien)} » (${cites.join(' ; ')}) : à corriger avec « Modifier » dans Session → Réorganiser.`);
        }
      }
      setResultat(messages);
    } catch (e) {
      if (!(e instanceof ErreurModification)) throw e;
      setErreur(e.message);
    }
  };

  if (resultat)
    return (
      <div className="panneau-edition" role="status">
        {resultat.map((m, i) => (
          <p key={i} className={m.startsWith('Les étapes') ? 'texte-alerte petit' : undefined}>
            {m}
          </p>
        ))}
        <button type="button" className="bouton" onClick={fermer}>
          Fermer
        </button>
      </div>
    );

  return (
    <div className="panneau-edition editeur-ingredients">
      <p className="discret petit">Quantités pour {recette.portions} portions (la recette). Laissez vide si la quantité n’est pas connue.</p>
      <ul className="liste-edition">
        {lignes.map((l, i) => (
          <li key={`${l.ingredient}-${i}`}>
            <div className="ligne-edition-titre">
              <strong>{nomDe(l.ingredient)}</strong>
              <span className="actions">
                <button type="button" className="bouton-lien" onClick={() => setChoix({ mode: 'remplacer', index: i })} aria-label={`Remplacer ${nomDe(l.ingredient)}`}>
                  Remplacer
                </button>
                <button type="button" className="bouton-lien" onClick={() => setLignes(lignes.filter((_, k) => k !== i))} aria-label={`Retirer ${nomDe(l.ingredient)}`}>
                  Retirer
                </button>
              </span>
            </div>
            {choix?.mode === 'remplacer' && choix.index === i && (
              <ChoixIngredient catalogue={tous} choisir={choisirIngredient} annuler={() => setChoix(null)} titre="Remplacer par" />
            )}
            <div className="ligne-edition-champs">
              <input
                inputMode="decimal"
                aria-label={`Quantité de ${nomDe(l.ingredient)}`}
                value={l.quantite}
                placeholder="?"
                onChange={(e) => maj(i, { quantite: e.target.value })}
              />
              <select aria-label={`Unité de ${nomDe(l.ingredient)}`} value={l.unite} onChange={(e) => maj(i, { unite: e.target.value as Unite })}>
                {UNITES.map((u) => (
                  <option key={u} value={u}>
                    {LIBELLES_UNITE[u]}
                  </option>
                ))}
              </select>
              <input aria-label={`Note pour ${nomDe(l.ingredient)}`} value={l.note} placeholder="note (facultatif)" onChange={(e) => maj(i, { note: e.target.value })} />
            </div>
          </li>
        ))}
      </ul>
      {choix?.mode === 'ajouter' ? (
        <ChoixIngredient catalogue={tous} choisir={choisirIngredient} annuler={() => setChoix(null)} titre="Ingrédient à ajouter" />
      ) : (
        <button type="button" className="bouton-secondaire" onClick={() => setChoix({ mode: 'ajouter' })}>
          + Ajouter un ingrédient
        </button>
      )}

      {portees.length > 1 && (
        <fieldset className="choix">
          <legend>Appliquer</legend>
          {portees.includes('semaine') && semaine && (
            <label>
              <input type="radio" name="portee" checked={portee === 'semaine'} onChange={() => setPortee('semaine')} />
              Cette semaine seulement (semaine {semaine.numero})
            </label>
          )}
          {portees.includes('mois') && (
            <label>
              <input type="radio" name="portee" checked={portee === 'mois'} onChange={() => setPortee('mois')} />
              Tout le mois (et la bibliothèque)
            </label>
          )}
        </fieldset>
      )}
      {remplacements.length > 0 && portee !== 'bibliotheque' && planMois && (
        <label className="interrupteur">
          <input type="checkbox" checked={partout} onChange={(e) => setPartout(e.target.checked)} />
          Remplacer aussi dans les autres recettes {portee === 'semaine' ? 'de la semaine' : 'du mois'}
        </label>
      )}
      {erreur && (
        <p className="texte-alerte" role="alert">
          {erreur}
        </p>
      )}
      <div className="actions">
        <button type="button" className="bouton" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
        <button type="button" className="bouton-secondaire" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}
