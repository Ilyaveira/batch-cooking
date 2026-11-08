// Liste de courses : somme des ingrédients des plats de la semaine (mis à l'échelle),
// agrégée par ingrédient et par famille d'unités, triée par rayon.
import { RAYONS, type Rayon } from './constantes';
import { facteurPortions } from './portions';
import type { Ingredient, Plan, Semaine } from './schema/plan';
import { familleDe, formaterQuantite, versBase, type Famille } from './unites';

export type Provenance = { origine: string; quantiteBase: number | null };

export type LigneCalculee = {
  /** Clé stable « ingredient|famille » (sert aussi aux cases cochées). */
  cle: string;
  ingredient: Ingredient;
  famille: Famille;
  /** Somme des quantités connues, dans l'unité de base de la famille ; null si aucune n'est connue. */
  quantiteBase: number | null;
  /** Au moins une contribution n'a pas de quantité dans le plan. */
  incomplete: boolean;
  provenances: Provenance[];
};

export type RayonCourses = { rayon: Rayon; lignes: LigneCalculee[] };

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

class Agregateur {
  private lignes = new Map<string, LigneCalculee>();
  constructor(private ingredients: Map<string, Ingredient>) {}

  ajouter(idIngredient: string, quantite: number | null, unite: Parameters<typeof familleDe>[0], origine: string) {
    const ingredient = this.ingredients.get(idIngredient);
    if (!ingredient) throw new Error(`Ingrédient inconnu : ${idIngredient}`);
    const famille = familleDe(unite);
    const cle = `${idIngredient}|${famille}`;
    const base = quantite === null ? null : versBase(quantite, unite);
    const ligne = this.lignes.get(cle) ?? {
      cle,
      ingredient,
      famille,
      quantiteBase: null,
      incomplete: false,
      provenances: [],
    };
    if (base === null) ligne.incomplete = true;
    else ligne.quantiteBase = (ligne.quantiteBase ?? 0) + base;
    ligne.provenances.push({ origine, quantiteBase: base });
    this.lignes.set(cle, ligne);
  }

  resultat(): LigneCalculee[] {
    return [...this.lignes.values()];
  }
}

function indexIngredients(plan: Plan) {
  return new Map(plan.ingredients.map((i) => [i.id, i]));
}

/** Toutes les lignes (placard compris) nécessaires aux plats d'une semaine. */
export function besoinsSemaine(plan: Plan, semaine: Semaine): LigneCalculee[] {
  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  const ag = new Agregateur(indexIngredients(plan));
  for (const plat of semaine.plats) {
    const recette = recettes.get(plat.recette);
    if (!recette) throw new Error(`Recette inconnue : ${plat.recette}`);
    const f = facteurPortions(plat.portions, recette.portions);
    for (const l of recette.ingredients) {
      ag.ajouter(l.ingredient, l.quantite === null ? null : l.quantite * f, l.unite, recette.nom);
    }
  }
  for (const l of semaine.coursesSupplementaires ?? []) {
    ag.ajouter(l.ingredient, l.quantite, l.unite, l.note ? `En plus (${l.note})` : 'En plus');
  }
  return ag.resultat();
}

export function trierParRayon(lignes: LigneCalculee[]): RayonCourses[] {
  return RAYONS.map((rayon) => ({
    rayon,
    lignes: lignes
      .filter((l) => l.ingredient.rayon === rayon)
      .sort((a, b) => collator.compare(a.ingredient.nom, b.ingredient.nom)),
  })).filter((r) => r.lignes.length > 0);
}

/** Liste de courses hebdomadaire : hors produits de placard. */
export function coursesSemaine(plan: Plan, semaine: Semaine): RayonCourses[] {
  return trierParRayon(besoinsSemaine(plan, semaine).filter((l) => !l.ingredient.placard));
}

export type LignePlacardCalculee = {
  ingredient: Ingredient;
  /** Quantité indiquée par le plan dans « placard », s'il y en a une. */
  prevu: string | null;
  /** Quantités utilisées par les recettes du mois, par famille d'unités. */
  utiliseCeMois: { famille: Famille; quantiteBase: number | null; incomplete: boolean }[];
  semaines: number[];
  note?: string;
};

/**
 * Liste « placard » mensuelle : les entrées « placard » du plan, plus tout ingrédient marqué
 * placard utilisé dans le mois (pour ne rien oublier).
 */
export function placardMois(plan: Plan): LignePlacardCalculee[] {
  const ingredients = indexIngredients(plan);
  const lignes = new Map<string, LignePlacardCalculee>();
  const obtenir = (id: string) => {
    let l = lignes.get(id);
    if (!l) {
      l = { ingredient: ingredients.get(id)!, prevu: null, utiliseCeMois: [], semaines: [] };
      lignes.set(id, l);
    }
    return l;
  };
  for (const p of plan.placard ?? []) {
    const l = obtenir(p.ingredient);
    if (p.quantite != null && p.unite) l.prevu = formaterQuantite(versBase(p.quantite, p.unite), familleDe(p.unite));
    if (p.note) l.note = p.note;
  }
  for (const s of plan.semaines) {
    for (const b of besoinsSemaine(plan, s)) {
      if (!b.ingredient.placard) continue;
      const l = obtenir(b.ingredient.id);
      if (!l.semaines.includes(s.numero)) l.semaines.push(s.numero);
      const u = l.utiliseCeMois.find((x) => x.famille === b.famille);
      if (u) {
        u.incomplete ||= b.incomplete;
        if (b.quantiteBase !== null) u.quantiteBase = (u.quantiteBase ?? 0) + b.quantiteBase;
      } else {
        l.utiliseCeMois.push({ famille: b.famille, quantiteBase: b.quantiteBase, incomplete: b.incomplete });
      }
    }
  }
  return [...lignes.values()].sort((a, b) => collator.compare(a.ingredient.nom, b.ingredient.nom));
}

export function texteQuantite(l: { quantiteBase: number | null; famille: Famille; incomplete: boolean }): string {
  if (l.quantiteBase === null) return 'quantité non précisée';
  const t = formaterQuantite(l.quantiteBase, l.famille);
  return l.incomplete ? `${t} + quantité non précisée` : t;
}
