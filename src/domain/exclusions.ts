// Repérage des aliments exclus dans les plats, personne par personne.
import type { Plan } from './schema/plan';
import type { PersonneReglages } from './reglages';

/** Minuscules, sans accents, mots au singulier approximatif (s/x final retiré). */
export function normaliser(texte: string): string[] {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((m) => (m.length > 3 ? m.replace(/[sx]$/, '') : m));
}

/** Vrai si la suite de mots de l'exclusion apparaît dans le nom de l'ingrédient. */
export function contientExclusion(nomIngredient: string, exclusion: string): boolean {
  const mots = normaliser(nomIngredient);
  const cible = normaliser(exclusion);
  if (cible.length === 0) return false;
  for (let i = 0; i + cible.length <= mots.length; i++) {
    if (cible.every((m, k) => mots[i + k] === m)) return true;
  }
  return false;
}

export type AlerteExclusion = { semaine: number; recette: string; ingredient: string; personne: string; exclusion: string };

export function alertesExclusions(plan: Plan, personnes: PersonneReglages[]): AlerteExclusion[] {
  const ingredients = new Map(plan.ingredients.map((i) => [i.id, i]));
  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  const reglagesParId = new Map(personnes.map((p) => [p.id, p]));
  const tous = plan.personnes.map((p) => p.id);
  const alertes: AlerteExclusion[] = [];
  for (const s of plan.semaines) {
    for (const plat of s.plats) {
      const recette = recettes.get(plat.recette)!;
      for (const idPersonne of plat.pour ?? tous) {
        const p = reglagesParId.get(idPersonne);
        if (!p) continue;
        for (const l of recette.ingredients) {
          const nom = ingredients.get(l.ingredient)!.nom;
          for (const ex of p.exclusions) {
            if (contientExclusion(nom, ex))
              alertes.push({ semaine: s.numero, recette: recette.nom, ingredient: nom, personne: p.nom, exclusion: ex });
          }
        }
      }
    }
  }
  return alertes;
}
