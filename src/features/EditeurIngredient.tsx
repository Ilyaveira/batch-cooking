// Panneau « Modifier l'ingrédient » : nom, rayon, rangement, produit de placard.
// Mémorisé sur ce téléphone pour tous les mois (par identifiant d'ingrédient).
import { useState } from 'react';
import { usePlanActif } from '../app/hooks';
import { enregistrerInfosIngredient, oublierInfosIngredient } from '../data/depot';
import { LIBELLES_RAYON, LIBELLES_STOCKAGE, RAYONS, STOCKAGES, STOCKAGE_PAR_RAYON, type Rayon, type Stockage } from '../domain/constantes';
import type { Ingredient } from '../domain/schema/plan';

export function EditeurIngredient({ ingredient, fermer, rangementEnPremier }: { ingredient: Ingredient; fermer: () => void; rangementEnPremier?: boolean }) {
  const { infos } = usePlanActif();
  const [nom, setNom] = useState(ingredient.nom);
  const [rayon, setRayon] = useState<Rayon>(ingredient.rayon);
  const [stockage, setStockage] = useState<Stockage>(ingredient.stockage ?? STOCKAGE_PAR_RAYON[ingredient.rayon]);
  const [placard, setPlacard] = useState(!!ingredient.placard);
  const [erreur, setErreur] = useState<string | null>(null);
  const perso = infos.find((i) => i.id === ingredient.id);

  const enregistrer = async () => {
    if (!nom.trim()) return setErreur('Le nom ne peut pas être vide.');
    await enregistrerInfosIngredient({ id: ingredient.id, nom: nom.trim(), rayon, stockage, placard });
    fermer();
  };

  const champRangement = (
    <label className="champ" key="rangement">
      Rangé à la maison
      <select value={stockage} onChange={(e) => setStockage(e.target.value as Stockage)}>
        {STOCKAGES.map((s) => (
          <option key={s} value={s}>
            {LIBELLES_STOCKAGE[s]}
          </option>
        ))}
      </select>
    </label>
  );
  const champs = [
    <label className="champ" key="nom">
      Nom
      <input value={nom} onChange={(e) => setNom(e.target.value)} />
    </label>,
    <label className="champ" key="rayon">
      Rayon du magasin
      <select value={rayon} onChange={(e) => setRayon(e.target.value as Rayon)}>
        {RAYONS.map((r) => (
          <option key={r} value={r}>
            {LIBELLES_RAYON[r]}
          </option>
        ))}
      </select>
    </label>,
  ];

  return (
    <div className="panneau-edition" role="group" aria-label={`Modifier l’ingrédient ${ingredient.nom}`}>
      {rangementEnPremier ? [champRangement, ...champs] : [...champs, champRangement]}
      <label className="interrupteur">
        <input type="checkbox" checked={placard} onChange={(e) => setPlacard(e.target.checked)} /> Produit de placard (vérifié une fois par
        mois, hors courses de la semaine)
      </label>
      <p className="discret petit">Mémorisé sur ce téléphone pour tous les mois.</p>
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
        {perso && !perso.cree && (
          <button
            type="button"
            className="bouton-lien"
            onClick={() => {
              void oublierInfosIngredient(ingredient.id);
              fermer();
            }}
          >
            Revenir aux infos du plan
          </button>
        )}
      </div>
    </div>
  );
}
