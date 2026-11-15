// Construit public/data/portions-usda.json : masses moyennes par unité ménagère, pour les
// aliments de scripts/correspondances-usda.ts.
//
// Source : USDA FoodData Central, SR Legacy (avril 2018), table food_portion — domaine public,
// CC0 1.0 (https://fdc.nal.usda.gov/api-guide, rubrique « Licensing » : source à citer).
// Fichier : https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//
// Usage : npx tsx scripts/construire-portions.ts <dossier contenant food.csv, food_portion.csv, measure_unit.csv>
//
// Les masses sont recopiées (division par la quantité de la mesure seulement, ex. « 0.5 tsp ») ;
// la masse par ml est déduite d'une mesure en volume aux définitions exactes des unités américaines.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORRESPONDANCES_USDA } from './correspondances-usda';
import { classerMesureUsda, ML_PAR_MESURE_US, type PortionUsda } from '../src/domain/portions-usda';

const dossier: string = process.argv[2] ?? '';
if (!dossier) {
  console.error('Usage : npx tsx scripts/construire-portions.ts <dossier SR Legacy CSV>');
  process.exit(1);
}

/** Lecteur CSV minimal (champs entre guillemets, virgules). */
function lireCsv(fichier: string): Record<string, string>[] {
  const lignes = readFileSync(join(dossier, fichier), 'utf8').split(/\r?\n/).filter(Boolean);
  const champs = (l: string) => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,)(?=,|$)/g)].map((m) => (m[1] ?? m[2] ?? '').replace(/""/g, '"'));
  const entete = champs(lignes[0]!);
  return lignes.slice(1).map((l) => Object.fromEntries(champs(l).map((v, i) => [entete[i], v])));
}

const unites = new Map(lireCsv('measure_unit.csv').map((r) => [r.id!, r.name!]));
const description = new Map(lireCsv('food.csv').map((r) => [r.fdc_id!, r.description!]));
const portionsParAliment = new Map<string, Record<string, string>[]>();
for (const r of lireCsv('food_portion.csv')) {
  const l = portionsParAliment.get(r.fdc_id!) ?? [];
  l.push(r);
  portionsParAliment.set(r.fdc_id!, l);
}

const aliments: Record<string, { fdcId: string; description: string; note?: string; portions: PortionUsda[]; gParMl?: { valeur: number; depuis: string } }> = {};
for (const c of CORRESPONDANCES_USDA) {
  const desc = description.get(c.fdcId);
  if (!desc) throw new Error(`fdcId ${c.fdcId} absent de food.csv (${c.ciqualNom})`);
  const portions: PortionUsda[] = [];
  let gParMl: { valeur: number; depuis: string } | undefined;
  for (const r of portionsParAliment.get(c.fdcId) ?? []) {
    const nomUnite = unites.get(r.measure_unit_id!) ?? 'undetermined';
    const libelle = [r.amount, nomUnite === 'undetermined' ? '' : nomUnite, r.portion_description, r.modifier].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const quantite = Number(r.amount);
    const g = Number(r.gram_weight);
    if (!(quantite > 0) || !(g > 0)) continue;
    const classe = classerMesureUsda(nomUnite, r.modifier ?? '');
    const parUnite = Math.round((g / quantite) * 100) / 100;
    // Une même masse pour la même unité (« 1 clove », « 3 cloves ») n'est gardée qu'une fois.
    if (classe.unite && !portions.some((p) => p.unite === classe.unite && p.g === parUnite)) portions.push({ unite: classe.unite, libelle, g: parUnite });
    // Masse volumique : la cuillère à soupe d'abord (mesure la plus proche des usages), sinon la tasse ou l'once liquide.
    if (classe.volume && (!gParMl || (classe.volume === 'tbsp' && !gParMl.depuis.includes('tbsp')))) {
      gParMl = { valeur: Math.round((g / quantite / ML_PAR_MESURE_US[classe.volume]) * 1000) / 1000, depuis: `${libelle} = ${g} g` };
    }
  }
  aliments[c.ciqual] = { fdcId: c.fdcId, description: desc, ...(c.note ? { note: c.note } : {}), portions, ...(gParMl ? { gParMl } : {}) };
}

const sortie = {
  source: {
    libelle: 'USDA FoodData Central — SR Legacy (avril 2018), mesures ménagères',
    url: 'https://fdc.nal.usda.gov/',
    licence: 'Domaine public, CC0 1.0',
    licenceUrl: 'https://fdc.nal.usda.gov/api-guide',
    note: 'Masses moyennes de la partie comestible pour des aliments américains ; à confirmer ou remplacer par une pesée.',
  },
  aliments,
};
const chemin = new URL('../public/data/portions-usda.json', import.meta.url);
writeFileSync(chemin, JSON.stringify(sortie));
console.log(`${Object.keys(aliments).length} aliments → ${chemin.pathname}`);
