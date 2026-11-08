// Fonctions d'accès aux données : l'interface ne parle jamais directement à Dexie.
import { REGLAGES_DEFAUT, type Reglages } from '../domain/reglages';
import type { Personnalisation } from '../domain/reorganisation';
import type { Plan } from '../domain/schema/plan';
import {
  db,
  meta,
  type BaseBatch,
  type Cochage,
  type PersonnalisationEnregistree,
  type PlanEnregistre,
  type RecetteEnregistree,
} from './db';

export async function lireReglages(base: BaseBatch = db): Promise<Reglages> {
  const r = await base.reglages.get('reglages');
  return r ? { ...REGLAGES_DEFAUT, ...r.valeur } : REGLAGES_DEFAUT;
}

export async function enregistrerReglages(valeur: Reglages, base: BaseBatch = db): Promise<void> {
  await base.reglages.put({ cle: 'reglages', valeur, ...meta() });
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
  await base.transaction('rw', base.plans, base.cochages, base.personnalisations, async () => {
    await base.plans.delete(mois);
    await base.cochages.where('cle').startsWith(`${mois}|`).delete();
    await base.personnalisations.where('mois').equals(mois).delete();
  });
}

const clePerso = (mois: string, semaine: number) => `${mois}|${semaine}`;

export async function lirePersonnalisation(mois: string, semaine: number, base: BaseBatch = db): Promise<Personnalisation | null> {
  const p = await base.personnalisations.get(clePerso(mois, semaine));
  return p ? { ordre: p.ordre, heures: p.heures } : null;
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
  else await base.personnalisations.put({ cle, mois, semaine, ordre: perso.ordre, heures: perso.heures, ...meta() });
}

/** Personnalisations d'un mois, par numéro de semaine (pour l'export du plan). */
export async function personnalisationsDuMois(mois: string, base: BaseBatch = db): Promise<Map<number, Personnalisation>> {
  const liste = await base.personnalisations.where('mois').equals(mois).toArray();
  return new Map(liste.map((p) => [p.semaine, { ordre: p.ordre, heures: p.heures }]));
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
};

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
  };
}

/** Restaure une sauvegarde : remplace tout le contenu actuel. */
export async function restaurerSauvegarde(s: Sauvegarde, base: BaseBatch = db): Promise<void> {
  if (s.format !== 'batch-cooking-sauvegarde' || s.version !== 1)
    throw new Error('Ce fichier n’est pas une sauvegarde de l’application (format ou version inconnus).');
  const tables = [base.plans, base.recettes, base.cochages, base.reglages, base.personnalisations];
  await base.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await base.plans.bulkPut(s.plans);
    await base.recettes.bulkPut(s.recettes);
    await base.cochages.bulkPut(s.cochages);
    await base.personnalisations.bulkPut(s.personnalisations ?? []);
    await enregistrerReglages(s.reglages, base);
  });
}
