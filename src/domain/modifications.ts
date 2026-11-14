// Modifications des ingrédients faites dans l'app, gardées à part du plan importé :
// - infos d'un ingrédient (nom, rayon, rangement, produit de placard), mémorisées pour tous les
//   mois, et ingrédients créés dans l'app ;
// - lignes d'ingrédients d'une recette, pour une semaine (ponctuel) ou pour tout le mois (permanent).
// Priorité : semaine > mois > plan importé. Tous les calculs existants (courses, placard,
// « à sortir », fiche recette) s'appliquent ensuite sur le plan obtenu, sans changement.
import { RAYONS, STOCKAGES, UNITES, type Rayon, type Stockage } from './constantes';
import { normaliser } from './exclusions';
import type { Ingredient, LigneIngredient, Plan, Recette, Semaine } from './schema/plan';

export type InfosIngredientPerso = {
  id: string;
  nom?: string;
  rayon?: Rayon;
  stockage?: Stockage;
  placard?: boolean;
  /** Ingrédient créé dans l'app (nom et rayon alors obligatoires). */
  cree?: boolean;
};

/** Lignes d'ingrédients d'une recette modifiées dans l'app. `semaine` 0 = tout le mois. */
export type RecettePerso = { mois: string; semaine: number; recetteId: string; ingredients: LigneIngredient[] };

export class ErreurModification extends Error {}

/** Catalogue d'ingrédients avec les infos modifiées et les ingrédients créés dans l'app. */
export function appliquerInfosIngredients(plan: Plan, infos: InfosIngredientPerso[]): Plan {
  const parId = new Map(infos.map((i) => [i.id, i]));
  const ingredients: Ingredient[] = plan.ingredients.map((ing) => {
    const p = parId.get(ing.id);
    if (!p) return ing;
    return {
      ...ing,
      ...(p.nom ? { nom: p.nom } : {}),
      ...(p.rayon ? { rayon: p.rayon } : {}),
      ...(p.stockage ? { stockage: p.stockage } : {}),
      ...(p.placard !== undefined ? { placard: p.placard } : {}),
    };
  });
  const connus = new Set(plan.ingredients.map((i) => i.id));
  for (const p of infos) {
    if (!p.cree || connus.has(p.id) || !p.nom || !p.rayon) continue;
    ingredients.push({
      id: p.id,
      nom: p.nom,
      rayon: p.rayon,
      ...(p.stockage ? { stockage: p.stockage } : {}),
      ...(p.placard ? { placard: true } : {}),
    });
  }
  return { ...plan, ingredients };
}

export type ResultatApplication = { plan: Plan; ignorees: string[] };

function appliquerLignes(plan: Plan, persos: RecettePerso[]): ResultatApplication {
  const connus = new Set(plan.ingredients.map((i) => i.id));
  const parRecette = new Map(persos.map((p) => [p.recetteId, p]));
  const ignorees: string[] = [];
  const recettes = plan.recettes.map((r) => {
    const p = parRecette.get(r.id);
    if (!p) return r;
    // Une ligne qui cite un ingrédient disparu (après un réimport) est ignorée et signalée.
    const lignes = p.ingredients.filter((l) => {
      if (connus.has(l.ingredient)) return true;
      ignorees.push(`${r.nom} : « ${l.ingredient} » n’existe plus dans le plan`);
      return false;
    });
    return lignes.length ? { ...r, ingredients: lignes } : r;
  });
  return { plan: { ...plan, recettes }, ignorees };
}

/** Modifications permanentes (tout le mois) appliquées aux recettes du plan. */
export function appliquerRecettesMois(plan: Plan, persos: RecettePerso[]): ResultatApplication {
  return appliquerLignes(plan, persos.filter((p) => p.mois === plan.mois && p.semaine === 0));
}

/** Plan vu depuis une semaine : ses modifications ponctuelles en plus de celles du mois. */
export function planDeSemaine(planMois: Plan, semaine: Semaine, persos: RecettePerso[]): ResultatApplication {
  return appliquerLignes(planMois, persos.filter((p) => p.mois === planMois.mois && p.semaine === semaine.numero));
}

/** Remplace un ingrédient par un autre dans des lignes (quantité, unité et note conservées). */
export function remplacerIngredient(lignes: LigneIngredient[], ancien: string, nouveau: string): LigneIngredient[] {
  if (ancien === nouveau) return lignes;
  return lignes.map((l) => (l.ingredient === ancien ? { ...l, ingredient: nouveau } : l));
}

/**
 * Modifications de recettes produites par un remplacement : une par recette concernée (parmi
 * `recettesIds`) qui contient l'ingrédient, à partir de ses lignes actuelles.
 */
export function remplacerDansRecettes(
  plan: Plan,
  ancien: string,
  nouveau: string,
  recettesIds: string[],
  semaine: number,
): RecettePerso[] {
  return plan.recettes
    .filter((r) => recettesIds.includes(r.id) && r.ingredients.some((l) => l.ingredient === ancien))
    .map((r) => ({ mois: plan.mois, semaine, recetteId: r.id, ingredients: remplacerIngredient(r.ingredients, ancien, nouveau) }));
}

/** Recettes des plats d'une semaine (portée « toute la semaine » d'un remplacement). */
export function recettesDeSemaine(semaine: Semaine): string[] {
  return [...new Set(semaine.plats.map((p) => p.recette))];
}

/** Recettes du plan qui citent encore un ingrédient dans le texte de leurs étapes de session. */
export function etapesCitant(plan: Plan, nomIngredient: string, semaines?: number[]): string[] {
  const cible = normaliser(nomIngredient).join(' ');
  if (!cible) return [];
  return plan.semaines
    .filter((s) => !semaines || semaines.includes(s.numero))
    .flatMap((s) => (s.session?.etapes ?? []).map((e) => ({ s, e })))
    .filter(({ e }) => normaliser([e.texte, ...(e.details ?? [])].join(' ')).join(' ').includes(cible))
    .map(({ s, e }) => `semaine ${s.numero}, ${e.debut}`);
}

/** Identifiant d'un ingrédient créé : « Potimarron » → « potimarron » (ou « potimarron-2 »). */
export function creerIdIngredient(nom: string, existants: Set<string>): string {
  const base =
    nom
      .replace(/œ/g, 'oe')
      .replace(/Œ/g, 'Oe')
      .replace(/æ/g, 'ae')
      .replace(/Æ/g, 'Ae')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ingredient';
  if (!existants.has(base)) return base;
  let n = 2;
  while (existants.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Contrôle un ingrédient créé dans l'app. */
export function verifierIngredientCree(i: InfosIngredientPerso): void {
  if (!i.nom?.trim()) throw new ErreurModification('Le nom de l’ingrédient est obligatoire.');
  if (!i.rayon || !RAYONS.includes(i.rayon)) throw new ErreurModification('Choisissez un rayon.');
  if (i.stockage && !STOCKAGES.includes(i.stockage)) throw new ErreurModification('Lieu de rangement inconnu.');
}

/** Contrôle les lignes d'une recette avant enregistrement. */
export function verifierLignes(lignes: LigneIngredient[], ingredientsConnus: Set<string>): void {
  if (lignes.length === 0) throw new ErreurModification('Une recette doit garder au moins un ingrédient.');
  lignes.forEach((l, i) => {
    const n = `Ligne ${i + 1}`;
    if (!ingredientsConnus.has(l.ingredient)) throw new ErreurModification(`${n} : ingrédient inconnu.`);
    if (!UNITES.includes(l.unite)) throw new ErreurModification(`${n} : unité inconnue.`);
    if (l.quantite !== null && !(Number.isFinite(l.quantite) && l.quantite > 0))
      throw new ErreurModification(`${n} : quantité attendue supérieure à 0 (ou vide si elle n’est pas connue).`);
  });
}

/** Lit une quantité saisie (« 120 », « 0,5 », vide = non précisée). */
export function lireQuantite(saisie: string): number | null | 'invalide' {
  const t = saisie.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : 'invalide';
}

/**
 * Plan à exporter : infos d'ingrédients et modifications du mois appliquées ; une modification
 * ponctuelle devient une recette dérivée « <id>-s<n> » utilisée par le plat de cette semaine.
 */
export function planExporte(plan: Plan, infos: InfosIngredientPerso[], persos: RecettePerso[]): Plan {
  const mois = appliquerRecettesMois(appliquerInfosIngredients(plan, infos), persos).plan;
  const ids = new Set(mois.recettes.map((r) => r.id));
  const derivees: Recette[] = [];
  const semaines = mois.semaines.map((s) => {
    const ponctuelles = persos.filter((p) => p.mois === plan.mois && p.semaine === s.numero);
    if (ponctuelles.length === 0) return s;
    const renommage = new Map<string, string>();
    for (const p of ponctuelles) {
      const r = mois.recettes.find((x) => x.id === p.recetteId);
      if (!r) continue;
      let id = `${r.id}-s${s.numero}`;
      for (let k = 2; ids.has(id); k++) id = `${r.id}-s${s.numero}-${k}`;
      ids.add(id);
      renommage.set(r.id, id);
      derivees.push({ ...r, id, nom: `${r.nom} (semaine ${s.numero})`, ingredients: p.ingredients });
    }
    return { ...s, plats: s.plats.map((pl) => (renommage.has(pl.recette) ? { ...pl, recette: renommage.get(pl.recette)! } : pl)) };
  });
  return { ...mois, recettes: [...mois.recettes, ...derivees], semaines };
}
