// Mise à l'échelle des quantités d'une recette selon le nombre de portions voulu.
import type { LigneIngredient, Recette } from './schema/plan';

export function facteurPortions(portionsVoulues: number, portionsRecette: number): number {
  if (portionsRecette <= 0) throw new Error('Le nombre de portions de la recette doit être positif.');
  if (portionsVoulues < 0) throw new Error('Le nombre de portions voulu ne peut pas être négatif.');
  return portionsVoulues / portionsRecette;
}

/** Une quantité inconnue (null) le reste : on ne la devine jamais. */
export function mettreAEchelle(ligne: LigneIngredient, facteur: number): LigneIngredient {
  return { ...ligne, quantite: ligne.quantite === null ? null : ligne.quantite * facteur };
}

export function ingredientsPourPortions(recette: Recette, portionsVoulues: number): LigneIngredient[] {
  const f = facteurPortions(portionsVoulues, recette.portions);
  return recette.ingredients.map((l) => mettreAEchelle(l, f));
}
