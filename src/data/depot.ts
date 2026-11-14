// Fonctions d'accès aux données : l'interface ne parle jamais directement à Dexie.
import { REGLAGES_DEFAUT, type Reglages } from '../domain/reglages';
import { verifierIngredientCree, type InfosIngredientPerso, type RecettePerso } from '../domain/modifications';
import { verifierNote, type Note } from '../domain/notation';
import type { Personnalisation } from '../domain/reorganisation';
import type { Plan } from '../domain/schema/plan';
import {
  db,
  meta,
  type BaseBatch,
  type Cochage,
  type IngredientPersoEnregistre,
  type NoteEnregistree,
  type RecettePersoEnregistree,
  type PersonnalisationEnregistree,
  type PlanEnregistre,
  type RecetteEnregistree,
  type EtiquettesPersoEnregistrees,
} from './db';
import type { EtiquettesPerso } from '../domain/bibliotheque';

export async function lireReglages(base: BaseBatch = db): Promise<Reglages> {
  const r = await base.reglages.get('reglages');
  return r ? { ...REGLAGES_DEFAUT, ...r.valeur, nutrition: { ...REGLAGES_DEFAUT.nutrition, ...r.valeur.nutrition } } : REGLAGES_DEFAUT;
}

export async function enregistrerReglages(valeur: Reglages, base: BaseBatch = db): Promise<void> {
  await base.reglages.put({ cle: 'reglages', valeur, ...meta() });
}

/**
 * Modifie les réglages à partir de leur version enregistrée (transaction) : deux saisies rapides
 * ne s'écrasent pas, contrairement à un enregistrement fait depuis l'état affiché.
 */
export async function modifierReglages(f: (r: Reglages) => Reglages, base: BaseBatch = db): Promise<void> {
  await base.transaction('rw', base.reglages, async () => {
    await enregistrerReglages(f(await lireReglages(base)), base);
  });
}

export type BilanImport = { mois: string; remplace: boolean; recettes: number; personnesAjoutees: string[] };

/**
 * Importe un plan validé : il remplace le plan du même mois, ses recettes rejoignent la
 * bibliothèque (mêmes id = mise à jour), et les personnes inconnues sont ajoutées aux réglages.
 * Les cases cochées et les réglages existants sont conservés.
 */
export async function importerPlan(plan: Plan, base: BaseBatch = db): Promise<BilanImport> {
  return base.transaction('rw', base.plans, base.recettes, base.reglages, async () => {
    const existant = await base.plans.get(plan.mois);
    const m = meta();
    await base.plans.put({ id: plan.mois, plan, importeLe: m.majLe, ...m });

    const ingredients = new Map(plan.ingredients.map((i) => [i.id, i]));
    const recettes: RecetteEnregistree[] = plan.recettes.map((recette) => ({
      id: recette.id,
      recette,
      ingredients: [...new Set(recette.ingredients.map((l) => l.ingredient))].map((id) => ingredients.get(id)!),
      moisOrigine: plan.mois,
      ...m,
    }));
    await base.recettes.bulkPut(recettes);

    const reglages = await lireReglages(base);
    const connus = new Set(reglages.personnes.map((p) => p.id));
    const nouvelles = plan.personnes.filter((p) => !connus.has(p.id));
    if (nouvelles.length > 0) {
      await enregistrerReglages(
        { ...reglages, personnes: [...reglages.personnes, ...nouvelles.map((p) => ({ ...p, exclusions: [] }))] },
        base,
      );
    }
    return { mois: plan.mois, remplace: !!existant, recettes: recettes.length, personnesAjoutees: nouvelles.map((p) => p.nom) };
  });
}

export async function supprimerPlan(mois: string, base: BaseBatch = db): Promise<void> {
  await base.transaction('rw', [base.plans, base.cochages, base.personnalisations, base.recettesPerso], async () => {
    await base.plans.delete(mois);
    await base.cochages.where('cle').startsWith(`${mois}|`).delete();
    await base.personnalisations.where('mois').equals(mois).delete();
    // Les infos d'ingrédients (globales) et les notes sont gardées.
    await base.recettesPerso.where('mois').equals(mois).delete();
  });
}

// --- Modifications des ingrédients ---

const cleRecettePerso = (mois: string, semaine: number, recetteId: string) => `${mois}|${semaine}|${recetteId}`;

export async function listerInfosIngredients(base: BaseBatch = db): Promise<InfosIngredientPerso[]> {
  return (await base.ingredientsPerso.toArray()).map(({ majLe: _m, appareil: _a, supprimeLe: _s, ...i }) => i);
}

/** Enregistre les infos d'un ingrédient (fusionnées avec celles déjà modifiées) ou un ingrédient créé. */
export async function enregistrerInfosIngredient(infos: InfosIngredientPerso, base: BaseBatch = db): Promise<void> {
  if (infos.cree) verifierIngredientCree(infos);
  const existant = await base.ingredientsPerso.get(infos.id);
  await base.ingredientsPerso.put({ ...(existant ?? {}), ...infos, ...meta() });
}

/** Revient aux infos du plan (un ingrédient créé, lui, garde sa définition). */
export async function oublierInfosIngredient(id: string, base: BaseBatch = db): Promise<void> {
  const existant = await base.ingredientsPerso.get(id);
  if (existant?.cree) return;
  await base.ingredientsPerso.delete(id);
}

export async function listerRecettesPerso(mois: string, base: BaseBatch = db): Promise<RecettePerso[]> {
  return (await base.recettesPerso.where('mois').equals(mois).toArray()).map(
    ({ cle: _c, majLe: _m, appareil: _a, supprimeLe: _s, ...r }) => r,
  );
}

/** Enregistre (ou, avec `null`, annule) la modification d'une recette pour une semaine ou le mois. */
export async function enregistrerRecettePerso(
  mois: string,
  semaine: number,
  recetteId: string,
  ingredients: RecettePerso['ingredients'] | null,
  base: BaseBatch = db,
): Promise<void> {
  const cle = cleRecettePerso(mois, semaine, recetteId);
  if (ingredients === null) await base.recettesPerso.delete(cle);
  else await base.recettesPerso.put({ cle, mois, semaine, recetteId, ingredients, ...meta() });
}

export async function enregistrerRecettesPerso(persos: RecettePerso[], base: BaseBatch = db): Promise<void> {
  const m = meta();
  await base.recettesPerso.bulkPut(persos.map((p) => ({ ...p, cle: cleRecettePerso(p.mois, p.semaine, p.recetteId), ...m })));
}

/** Modification permanente hors plan actif : met à jour la recette de la bibliothèque. */
export async function modifierRecetteBibliotheque(
  recetteId: string,
  ingredients: RecettePerso['ingredients'],
  catalogue: InfosIngredientPerso[],
  base: BaseBatch = db,
): Promise<void> {
  const r = await base.recettes.get(recetteId);
  if (!r) throw new Error(`Recette « ${recetteId} » introuvable.`);
  const connus = new Map(r.ingredients.map((i) => [i.id, i]));
  for (const c of catalogue) if (c.cree && c.nom && c.rayon && !connus.has(c.id)) connus.set(c.id, { id: c.id, nom: c.nom, rayon: c.rayon, ...(c.stockage ? { stockage: c.stockage } : {}) });
  const utilises = [...new Set(ingredients.map((l) => l.ingredient))].map((id) => connus.get(id)).filter((i) => i !== undefined);
  await base.recettes.put({ ...r, recette: { ...r.recette, ingredients }, ingredients: utilises, ...meta() });
}

const clePerso = (mois: string, semaine: number) => `${mois}|${semaine}`;

/** Retire les champs techniques d'un enregistrement (tous les champs de la personnalisation sont gardés). */
function versPersonnalisation(p: PersonnalisationEnregistree): Personnalisation {
  const { cle: _c, mois: _m, semaine: _s, majLe: _t, appareil: _a, supprimeLe: _d, ...perso } = p;
  return perso;
}

export async function lirePersonnalisation(mois: string, semaine: number, base: BaseBatch = db): Promise<Personnalisation | null> {
  const p = await base.personnalisations.get(clePerso(mois, semaine));
  return p ? versPersonnalisation(p) : null;
}

/** Enregistre l'ordre modifié d'une semaine ; null = revenir à l'ordre du plan. */
export async function enregistrerPersonnalisation(
  mois: string,
  semaine: number,
  perso: Personnalisation | null,
  base: BaseBatch = db,
): Promise<void> {
  const cle = clePerso(mois, semaine);
  if (perso === null) await base.personnalisations.delete(cle);
  else await base.personnalisations.put({ ...perso, cle, mois, semaine, ...meta() });
}

/** Personnalisations d'un mois, par numéro de semaine (pour l'export du plan). */
export async function personnalisationsDuMois(mois: string, base: BaseBatch = db): Promise<Map<number, Personnalisation>> {
  const liste = await base.personnalisations.where('mois').equals(mois).toArray();
  return new Map(liste.map((p) => [p.semaine, versPersonnalisation(p)]));
}

export async function listerPlans(base: BaseBatch = db): Promise<PlanEnregistre[]> {
  const plans = await base.plans.toArray();
  return plans.filter((p) => !p.supprimeLe).sort((a, b) => b.id.localeCompare(a.id));
}

export async function cocher(cle: string, coche: boolean, base: BaseBatch = db): Promise<void> {
  await base.cochages.put({ cle, coche, ...meta() });
}

export async function decocherTout(prefixe: string, base: BaseBatch = db): Promise<void> {
  await base.cochages.where('cle').startsWith(prefixe).delete();
}

export async function cochagesAvecPrefixe(prefixe: string, base: BaseBatch = db): Promise<Set<string>> {
  const liste: Cochage[] = await base.cochages.where('cle').startsWith(prefixe).toArray();
  return new Set(liste.filter((c) => c.coche).map((c) => c.cle));
}

export const cles = {
  courses: (mois: string, semaine: number, ligne: string) => `${mois}|courses|${semaine}|${ligne}`,
  placard: (mois: string, ingredient: string) => `${mois}|placard|0|${ingredient}`,
  etape: (mois: string, semaine: number, etape: string) => `${mois}|etape|${semaine}|${etape}`,
  prefixeCourses: (mois: string, semaine: number) => `${mois}|courses|${semaine}|`,
  prefixePlacard: (mois: string) => `${mois}|placard|`,
  prefixeEtapes: (mois: string, semaine: number) => `${mois}|etape|${semaine}|`,
  /** « À sortir » : ingrédient (clé de ligne « ingredient|famille ») ou ustensile (« u:libellé »). */
  sortir: (mois: string, semaine: number, element: string) => `${mois}|sortir|${semaine}|${element}`,
  prefixeSortir: (mois: string, semaine: number) => `${mois}|sortir|${semaine}|`,
  /** Élément « à sortir » d'un ustensile : libellé normalisé, stable d'une ouverture à l'autre. */
  ustensile: (libelle: string) => `u:${libelle.trim().toLocaleLowerCase('fr')}`,
};

/** Enregistre des notes (une par personne) ; chacune est vérifiée avant, rien n'est écrit en cas d'erreur. */
export async function ajouterNotes(notes: Omit<Note, 'id'>[], base: BaseBatch = db): Promise<string[]> {
  notes.forEach(verifierNote);
  const m = meta();
  const avecId = notes.map((n) => ({ ...n, id: crypto.randomUUID(), ...m }));
  await base.notations.bulkAdd(avecId);
  return avecId.map((n) => n.id);
}

/** Suppression logique (garde la trace pour une future synchronisation). */
export async function supprimerNote(id: string, base: BaseBatch = db): Promise<void> {
  await base.notations.update(id, { supprimeLe: Date.now(), majLe: Date.now() });
}

export async function listerNotes(base: BaseBatch = db): Promise<Note[]> {
  return (await base.notations.toArray()).filter((n) => !n.supprimeLe).map(versNote);
}

export async function notesDeRecette(recetteId: string, base: BaseBatch = db): Promise<Note[]> {
  return (await base.notations.where('recetteId').equals(recetteId).toArray()).filter((n) => !n.supprimeLe).map(versNote);
}

// --- Étiquettes des recettes ---

export async function listerEtiquettesPerso(base: BaseBatch = db): Promise<EtiquettesPerso[]> {
  return (await base.etiquettesPerso.toArray()).map(({ majLe: _m, appareil: _a, supprimeLe: _s, ...e }) => e);
}

/** Enregistre les étiquettes d'une recette ; null = revenir à celles du plan. */
export async function enregistrerEtiquettes(recetteId: string, e: Omit<EtiquettesPerso, 'recetteId'> | null, base: BaseBatch = db): Promise<void> {
  if (!e) await base.etiquettesPerso.delete(recetteId);
  else await base.etiquettesPerso.put({ recetteId, saisons: e.saisons, libres: e.libres, ...meta() });
}

function versNote(n: NoteEnregistree): Note {
  const { majLe: _m, appareil: _a, supprimeLe: _s, ...note } = n;
  return note;
}

/** Sauvegarde complète (tout ce qui est sur ce téléphone), pour la garder ou changer d'appareil. */
export type Sauvegarde = {
  format: 'batch-cooking-sauvegarde';
  version: 1;
  exporteLe: string;
  plans: PlanEnregistre[];
  recettes: RecetteEnregistree[];
  cochages: Cochage[];
  reglages: Reglages;
  /** Absent des sauvegardes faites avant la réorganisation des étapes. */
  personnalisations?: PersonnalisationEnregistree[];
  /** Absent des sauvegardes faites avant la notation des recettes. */
  notations?: NoteEnregistree[];
  /** Absents des sauvegardes faites avant la modification des ingrédients. */
  ingredientsPerso?: IngredientPersoEnregistre[];
  recettesPerso?: RecettePersoEnregistree[];
  /** Absent des sauvegardes faites avant les étiquettes modifiables. */
  etiquettesPerso?: EtiquettesPersoEnregistrees[];
};

export async function exporterSauvegarde(base: BaseBatch = db): Promise<Sauvegarde> {
  return {
    format: 'batch-cooking-sauvegarde',
    version: 1,
    exporteLe: new Date().toISOString(),
    plans: await base.plans.toArray(),
    recettes: await base.recettes.toArray(),
    cochages: await base.cochages.toArray(),
    reglages: await lireReglages(base),
    personnalisations: await base.personnalisations.toArray(),
    notations: await base.notations.toArray(),
    ingredientsPerso: await base.ingredientsPerso.toArray(),
    recettesPerso: await base.recettesPerso.toArray(),
    etiquettesPerso: await base.etiquettesPerso.toArray(),
  };
}

/** Restaure une sauvegarde : remplace tout le contenu actuel. */
export async function restaurerSauvegarde(s: Sauvegarde, base: BaseBatch = db): Promise<void> {
  if (s.format !== 'batch-cooking-sauvegarde' || s.version !== 1)
    throw new Error('Ce fichier n’est pas une sauvegarde de l’application (format ou version inconnus).');
  const tables = [
    base.plans,
    base.recettes,
    base.cochages,
    base.reglages,
    base.personnalisations,
    base.notations,
    base.ingredientsPerso,
    base.recettesPerso,
    base.etiquettesPerso,
  ];
  await base.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await base.plans.bulkPut(s.plans);
    await base.recettes.bulkPut(s.recettes);
    await base.cochages.bulkPut(s.cochages);
    await base.personnalisations.bulkPut(s.personnalisations ?? []);
    await base.notations.bulkPut(s.notations ?? []);
    await base.ingredientsPerso.bulkPut(s.ingredientsPerso ?? []);
    await base.recettesPerso.bulkPut(s.recettesPerso ?? []);
    await base.etiquettesPerso.bulkPut(s.etiquettesPerso ?? []);
    await enregistrerReglages(s.reglages, base);
  });
}
