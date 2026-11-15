// Masses moyennes par unité, tirées des mesures ménagères de l'USDA (FoodData Central, SR Legacy),
// pour PROPOSER une masse d'unité quand elle manque. Jamais appliquées sans confirmation.
import type { Unite } from './constantes';

/** Unités de l'app pour lesquelles une mesure USDA peut être proposée telle quelle. */
export type UniteProposable = Extract<Unite, 'piece' | 'cas' | 'cac' | 'gousse' | 'tranche'>;
export type PortionUsda = { unite: UniteProposable; libelle: string; g: number };

/** Définitions exactes des mesures américaines (ml). */
export const ML_PAR_MESURE_US = { tbsp: 14.7868, tsp: 4.92892, cup: 236.588, floz: 29.5735 } as const;
export type MesureVolume = keyof typeof ML_PAR_MESURE_US;

/**
 * Classe une mesure USDA (unité + modificateur, ex. « undetermined » + « tbsp chopped ») :
 * unité de l'app correspondante (cuillère, pièce…) et / ou mesure de volume utilisable pour une
 * masse volumique. Les mesures ambiguës (tasse de légumes coupés, botte, portion) ne sont pas retenues.
 */
export function classerMesureUsda(nomUnite: string, modificateur: string): { unite?: UniteProposable; volume?: MesureVolume } {
  const u = nomUnite.toLowerCase();
  const m = modificateur.toLowerCase().trim();
  // Masse volumique seulement d'une mesure « pure » (« tbsp », « 1 cup »), pas « cup, sections ».
  const pure = m === '' || /^(tbsp|tablespoon|tsp|teaspoon|cup|fl oz)( or 1 packet)?$/.test(m);
  if (u === 'tablespoon' || /^(tbsp|tablespoon)\b/.test(m)) return { unite: 'cas', ...(pure ? { volume: 'tbsp' as const } : {}) };
  if (u === 'teaspoon' || /^(tsp|teaspoon)\b/.test(m)) return { unite: 'cac', ...(pure ? { volume: 'tsp' as const } : {}) };
  if (u === 'cup' || /^cup\b/.test(m)) return pure ? { volume: 'cup' } : {};
  if (u === 'fl oz' || /^fl oz\b/.test(m)) return pure ? { volume: 'floz' } : {};
  if (/^cloves?\b/.test(m)) return { unite: 'gousse' };
  if (/^slice\b/.test(m)) return { unite: 'tranche' };
  if (/^(extra small|extra large|large|medium|small|jumbo|fruit|head|whole|potato|avocado|eggplant|cucumber|sweetpotato|each|piece)\b/.test(m)) return { unite: 'piece' };
  return {};
}

export type AlimentPortions = { fdcId: string; description: string; note?: string; portions: PortionUsda[]; gParMl?: { valeur: number; depuis: string } };
export type FichierPortions = { source: { libelle: string; url: string; licence: string; licenceUrl: string; note: string }; aliments: Record<string, AlimentPortions> };

export type MasseProposee = { g: number; libelle: string };

const ML_PAR_UNITE: Partial<Record<Unite, number>> = { ml: 1, cl: 10, l: 1000 };

/**
 * Masses proposées pour une unité d'un ingrédient dont l'aliment Ciqual est connu : les mesures
 * USDA de cette unité (plusieurs tailles possibles pour une pièce), ou pour ml / cl / l la masse
 * volumique × le volume. Rien pour botte, sachet, boîte, pot, pincée, ni hors table de correspondance.
 */
export function proposerMasses(f: FichierPortions | null, ciqual: string | undefined, unite: Unite): MasseProposee[] {
  const a = ciqual ? f?.aliments[ciqual] : undefined;
  if (!a) return [];
  const ml = ML_PAR_UNITE[unite];
  if (ml !== undefined) {
    if (!a.gParMl) return [];
    const g = Math.round(a.gParMl.valeur * ml * 10) / 10;
    return [{ g, libelle: `${a.gParMl.valeur.toLocaleString('fr-FR')} g/ml, d’après « ${a.gParMl.depuis} »` }];
  }
  return a.portions.filter((p) => p.unite === unite).map((p) => ({ g: p.g, libelle: p.libelle }));
}
