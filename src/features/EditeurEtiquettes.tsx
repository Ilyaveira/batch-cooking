// Modifier les saisons et les étiquettes libres d'une recette (pour tous les mois, sur ce téléphone).
import { useState } from 'react';
import { enregistrerEtiquettes } from '../data/depot';
import { lireEtiquettesLibres, trierSaisons } from '../domain/bibliotheque';
import { LIBELLES_SAISON, SAISONS, type Saison } from '../domain/constantes';
import type { Recette } from '../domain/schema/plan';

export function EditeurEtiquettes({ recette, modifiees, fermer }: { recette: Recette; modifiees: boolean; fermer: () => void }) {
  const [saisons, setSaisons] = useState<Saison[]>(recette.tags?.saisons ?? []);
  const [libres, setLibres] = useState((recette.tags?.libres ?? []).join(', '));
  const basculer = (s: Saison) => setSaisons(saisons.includes(s) ? saisons.filter((x) => x !== s) : [...saisons, s]);
  return (
    <div className="panneau-edition" role="group" aria-label="Modifier les étiquettes">
      <fieldset className="choix">
        <legend>Saisons</legend>
        {SAISONS.map((s) => (
          <label key={s}>
            <input type="checkbox" checked={saisons.includes(s)} onChange={() => basculer(s)} /> {LIBELLES_SAISON[s]}
          </label>
        ))}
      </fieldset>
      <label className="champ">
        Étiquettes libres (séparées par des virgules)
        <input value={libres} onChange={(e) => setLibres(e.target.value)} placeholder="ex. rapide, se congèle, lunchbox" />
      </label>
      <p className="discret petit">
        Mémorisé sur ce téléphone pour tous les mois et inclus dans l’export de la bibliothèque. Les étiquettes nutritionnelles, elles,
        sont calculées.
      </p>
      <div className="actions">
        <button
          type="button"
          className="bouton"
          onClick={async () => {
            await enregistrerEtiquettes(recette.id, { saisons: trierSaisons(saisons), libres: lireEtiquettesLibres(libres) });
            fermer();
          }}
        >
          Enregistrer
        </button>
        <button type="button" className="bouton-secondaire" onClick={fermer}>
          Annuler
        </button>
        {modifiees && (
          <button
            type="button"
            className="bouton-lien"
            onClick={async () => {
              await enregistrerEtiquettes(recette.id, null);
              fermer();
            }}
          >
            Revenir aux étiquettes du plan
          </button>
        )}
      </div>
    </div>
  );
}
