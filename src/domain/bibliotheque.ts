// Bibliothèque de recettes : étiquettes modifiées dans l'app (saisons, étiquettes libres) et
// export complet pour Claude (recettes au format du plan, saisons, notes, nutrition calculée).
import { SAISONS, type Saison } from './constantes';
import { appliquerInfosIngredient, type InfosIngredientPerso } from './modifications';
import { exporterNotes, type Note } from './notation';
import {
  etiquettesNutrition,
  etiquettesObtenues,
  nutritionRecette,
  NUTRIMENTS,
  type Intervalle,
  type Nutriment,
  type TableCiqual,
} from './nutrition';
import type { Ingredient, Recette } from './schema/plan';

/** Étiquettes d'une recette modifiées dans l'app (remplacent celles du plan), pour tous les mois. */
export type EtiquettesPerso = { recetteId: string; saisons: Saison[]; libres: string[] };

export function appliquerEtiquettes(r: Recette, p: EtiquettesPerso | undefined): Recette {
  if (!p) return r;
  const tags = { ...r.tags };
  if (p.saisons.length) tags.saisons = p.saisons;
  else delete tags.saisons;
  if (p.libres.length) tags.libres = p.libres;
  else delete tags.libres;
  return { ...r, tags };
}

/** Lit une saisie « batch, rapide, 15 min » → étiquettes libres distinctes, sans vide. */
export function lireEtiquettesLibres(saisie: string): string[] {
  const vues = new Set<string>();
  return saisie
    .split(',')
    .map((t) => t.trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (!t || vues.has(k)) return false;
      vues.add(k);
      return true;
    });
}

export function trierSaisons(s: Saison[]): Saison[] {
  return SAISONS.filter((x) => s.includes(x));
}

export type RecetteBibliotheque = { recette: Recette; ingredients: Ingredient[] };

const arrondir = (x: Intervalle, d: number) => {
  const k = 10 ** d;
  return { min: Math.round(x.min * k) / k, max: x.max === null ? null : Math.round(x.max * k) / k };
};

/**
 * Fichier « Bibliothèque pour Claude » : chaque recette complète (format du plan), ses ingrédients
 * (infos modifiées dans l'app comprises), ses saisons (« non renseignée » sinon), le résumé de ses
 * notes et, si la table Ciqual est chargée, sa nutrition par portion moyenne et ses étiquettes.
 */
export function exporterBibliotheque(args: {
  recettes: RecetteBibliotheque[];
  infos: InfosIngredientPerso[];
  etiquettes: EtiquettesPerso[];
  notes: Note[];
  personnes: Map<string, string>;
  table: TableCiqual | null;
  seuilGlucidesPct: number;
  maintenant?: Date;
}) {
  const { recettes, infos, etiquettes, notes, personnes, table, seuilGlucidesPct } = args;
  const maintenant = args.maintenant ?? new Date();
  const infosParId = new Map(infos.map((i) => [i.id, i]));
  const etiquettesParId = new Map(etiquettes.map((e) => [e.recetteId, e]));
  const notesParId = new Map(
    exporterNotes(notes, new Map(recettes.map((r) => [r.recette.id, r.recette.nom])), personnes, maintenant).recettes.map((r) => [r.id, r]),
  );
  return {
    format: 'batch-cooking-bibliotheque',
    version: 1,
    exporteLe: maintenant.toISOString(),
    lisezMoi:
      'Recettes au format « recettes » et « ingredients » de SCHEMA.md, réutilisables telles quelles (garder les id). ' +
      'saisons = "non renseignée" quand la recette n’en a pas. notes : 1 (mauvais) à 5 (excellent). ' +
      'nutritionParPortion : calculée par l’app depuis Ciqual, intervalles {min, max} (max null = inconnu) ; ' +
      'complet = false si des ingrédients n’ont pas pu être comptés (liste dans nonComptes).',
    sourceNutrition: table ? { ...table.source } : null,
    recettes: recettes
      .map(({ recette: r0, ingredients }) => {
        const recette = appliquerEtiquettes(r0, etiquettesParId.get(r0.id));
        const catalogue = ingredients.map((i) => appliquerInfosIngredient(i, infosParId.get(i.id)));
        const resume = notesParId.get(recette.id);
        let nutrition = null;
        if (table) {
          const n = nutritionRecette(recette, new Map(catalogue.map((i) => [i.id, i])), table, []);
          nutrition = {
            parPortion: Object.fromEntries(NUTRIMENTS.map((k) => [k, arrondir(n.portion.valeurs[k], k === 'kcal' ? 0 : 1)])) as Record<
              Nutriment,
              Intervalle
            >,
            complet: n.total.complet,
            nonComptes: n.total.manques.map((m) => `${m.nom} (${m.raison})`),
            etiquettes: etiquettesObtenues(etiquettesNutrition(n.total, seuilGlucidesPct)).map((e) => e.libelle),
          };
        }
        return {
          recette,
          ingredients: catalogue,
          saisons: recette.tags?.saisons?.length ? recette.tags.saisons : 'non renseignée',
          notes: resume ? { nbNotes: resume.nbNotes, gout: resume.gout, facilite: resume.facilite, derniereFois: resume.derniereFois, detail: resume.notes } : null,
          nutrition,
        };
      })
      .sort((a, b) => a.recette.nom.localeCompare(b.recette.nom, 'fr')),
  };
}
