import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import plan from '../../fixtures/novembre-2026-semaine1.json';
import {
  bilanLignes,
  chercherAliments,
  etiquettesNutrition,
  etiquettesObtenues,
  formaterIntervalle,
  lireTableCiqual,
  lireValeurCiqual,
  masseLigne,
  nutritionRecette,
  nutritionSemaine,
  partEnergie,
  positionObjectif,
  type FichierCiqual,
  type TableCiqual,
} from './nutrition';
import { validerPlan } from './schema/validation';
import type { Ingredient, LigneIngredient, Plan, Recette } from './schema/plan';

// Table de test : valeurs choisies pour des calculs à la main (pas des valeurs Ciqual).
const fichier: FichierCiqual = {
  source: { libelle: 'test', version: 't', publication: '', doi: '', url: '', licence: '', licenceUrl: '', note: '' },
  colonnes: ['code', 'nom', 'sousGroupe', 'kcal', 'proteines', 'glucides', 'sucres', 'lipides', 'ags', 'fibres', 'sel'],
  sousGroupes: {},
  aliments: [
    ['1', 'Poulet test', '0402', 100, 20, 0, 0, 2, 0.5, 0, 0.1],
    ['2', 'Riz test', '0901', 350, 7, 78, 0.5, 1, 0.2, 2, '<0.01'],
    ['3', 'Huile test', '0902', 900, 0, 'tr', 0, 100, 15, 0, null],
  ],
};
const table: TableCiqual = lireTableCiqual(fichier);
const ing = (id: string, code?: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  id,
  nom: id,
  rayon: 'epicerie',
  ...(code ? { ciqual: { code } } : {}),
  ...extra,
});
const catalogue = new Map<string, Ingredient>([
  ['poulet', ing('poulet', '1')],
  ['riz', ing('riz', '2', { feculent: true })],
  ['huile', ing('huile', '3', { masseParUnite: { cas: 10 } })],
  ['sel', ing('sel')],
]);
const l = (ingredient: string, quantite: number | null, unite: LigneIngredient['unite'] = 'g', extra: Partial<LigneIngredient> = {}): LigneIngredient => ({
  ingredient,
  quantite,
  unite,
  ...extra,
});

describe('lecture des teneurs Ciqual', () => {
  it('nombre à virgule, « < x », traces, tiret', () => {
    expect(lireValeurCiqual(' 12,5 ')).toBe(12.5);
    expect(lireValeurCiqual('< 0,5')).toBe('<0.5');
    expect(lireValeurCiqual('traces')).toBe('tr');
    expect(lireValeurCiqual('-')).toBeNull();
    expect(lireValeurCiqual('environ 3')).toBeUndefined();
  });
});

describe('masse d’une ligne', () => {
  it('kg converti, pièce et volume via masseParUnite, sinon inconnue', () => {
    const oeuf = ing('oeuf', undefined, { masseParUnite: { piece: 50 } });
    const lait = ing('lait', undefined, { masseParUnite: { ml: 1.03 } });
    expect(masseLigne(0.5, 'kg', oeuf)).toBe(500);
    expect(masseLigne(3, 'piece', oeuf)).toBe(150);
    expect(masseLigne(10, 'cl', lait)).toBeCloseTo(103);
    expect(masseLigne(1, 'botte', oeuf)).toBeNull();
  });
});

describe('bilan d’une liste d’ingrédients', () => {
  it('additionne les teneurs pour la masse pesée', () => {
    const b = bilanLignes([l('poulet', 200), l('huile', 1, 'cas')], catalogue, table);
    // 200 g de poulet (100 kcal/100 g) + 10 g d'huile (900 kcal/100 g) = 200 + 90.
    expect(b.valeurs.kcal).toEqual({ min: 290, max: 290 });
    expect(b.valeurs.proteines).toEqual({ min: 40, max: 40 });
    expect(b.masseG).toBe(210);
    // Huile : glucides « traces » → max inconnu ; sel absent de la table → max inconnu.
    expect(b.valeurs.glucides).toEqual({ min: 0, max: null });
    expect(b.approximations.map((a) => `${a.nom}:${a.nutriment}:${a.precision}`)).toEqual(['huile:glucides:traces', 'huile:sel:absente']);
    expect(b.complet).toBe(true);
  });

  it('« < x » devient l’intervalle [0, x]', () => {
    const b = bilanLignes([l('riz', 100)], catalogue, table);
    expect(b.valeurs.sel).toEqual({ min: 0, max: 0.01 });
  });

  it('signale sans compter : sans code, quantité non précisée, masse inconnue ; ignore le facultatif', () => {
    const b = bilanLignes(
      [l('poulet', 100), l('sel', 2), l('riz', null), l('huile', 1, 'cac'), l('riz', 50, 'g', { facultatif: true })],
      catalogue,
      table,
    );
    expect(b.complet).toBe(false);
    expect(b.manques.map((m) => `${m.nom}:${m.raison}`)).toEqual(['sel:sans-code', 'riz:quantite', 'huile:masse']);
    expect(b.facultatifsIgnores).toEqual(['riz']);
    expect(b.valeurs.kcal).toEqual({ min: 100, max: null });
  });

  it('code absent de la table', () => {
    const c = new Map([['x', ing('x', '999999')]]);
    expect(bilanLignes([l('x', 10)], c, table).manques[0]!.raison).toBe('code-inconnu');
  });
});

const recette: Recette = {
  id: 'poulet-riz',
  nom: 'Poulet riz',
  portions: 2,
  ingredients: [l('poulet', 300), l('riz', 140)],
};

describe('portions par personne (coefficient féculents)', () => {
  it('même part de tout, féculents au prorata ; total du plat conservé', () => {
    const n = nutritionRecette(recette, catalogue, table, [
      { id: 'a', coefFeculents: 0.75 },
      { id: 'b', coefFeculents: 1 },
    ]);
    // Riz : 140 g, 490 kcal ; poulet : 300 g, 300 kcal. Part de riz : a = 0,75 × 2 / 1,75, b = 1 × 2 / 1,75.
    const a = n.parPersonne.get('a')!.valeurs.kcal.min;
    const b = n.parPersonne.get('b')!.valeurs.kcal.min;
    expect(a).toBeCloseTo(150 + (245 * 1.5) / 1.75);
    expect(b).toBeCloseTo(150 + (245 * 2) / 1.75);
    expect(a + b).toBeCloseTo(n.total.valeurs.kcal.min);
    // Rapport des parts de riz : 0,75.
    expect((a - 150) / (b - 150)).toBeCloseTo(0.75);
    expect(n.portion.valeurs.kcal.min).toBeCloseTo(395);
    expect(n.feculents).toEqual(['riz']);
  });

  it('un seul mangeur : la portion moyenne', () => {
    const n = nutritionRecette(recette, catalogue, table, [{ id: 'a', coefFeculents: 0.75 }]);
    expect(n.parPersonne.get('a')!.valeurs.kcal.min).toBeCloseTo(395);
  });
});

describe('étiquettes (seuils du règlement 1924/2006)', () => {
  it('riche en protéines, pauvre en glucides selon le seuil personnel', () => {
    const b = bilanLignes([l('poulet', 300)], catalogue, table);
    const e = etiquettesNutrition(b, 26);
    const st = Object.fromEntries(e.map((x) => [x.cle, x.statut]));
    // 60 g × 4 = 240 kcal sur 300 kcal = 80 % ≥ 20 %.
    expect(st['riche-proteines']).toBe('oui');
    expect(st['pauvre-glucides']).toBe('oui');
    // Lipides 2 g/100 g ≤ 3.
    expect(st['pauvre-lipides']).toBe('oui');
    // AGS 0,5 g/100 g, 4,5 kcal / 100 kcal = 4,5 % ≤ 10 %.
    expect(st['pauvre-ags']).toBe('oui');
    expect(etiquettesObtenues(e).map((x) => x.cle)).not.toContain('source-proteines');
    expect(e.find((x) => x.cle === 'pauvre-glucides')!.source).toBeNull();
  });

  it('riz : pas riche en protéines (8 %), pas pauvre en glucides', () => {
    const b = bilanLignes([l('riz', 100)], catalogue, table);
    const st = Object.fromEntries(etiquettesNutrition(b).map((x) => [x.cle, x.statut]));
    expect(st['riche-proteines']).toBe('non');
    expect(st['source-proteines']).toBe('non');
    expect(st['pauvre-glucides']).toBe('non');
    // Sel « < 0,01 » : au plus 0,01 g/100 g ≤ 0,3 → oui malgré l'incertitude.
    expect(st['pauvre-sel']).toBe('oui');
  });

  it('données incomplètes : indéterminé plutôt que deviné', () => {
    const b = bilanLignes([l('poulet', 300), l('sel', 5)], catalogue, table);
    const pl = etiquettesNutrition(b).find((x) => x.cle === 'pauvre-lipides')!;
    expect(pl.statut).toBe('indetermine');
    expect(pl.raison).toMatch(/incomplètes/);
    // La part des protéines garde une borne basse : 240 kcal sur un total inconnu → indéterminé.
    expect(etiquettesNutrition(b).find((x) => x.cle === 'riche-proteines')!.statut).toBe('indetermine');
  });

  it('part de l’énergie et affichage des intervalles', () => {
    const b = bilanLignes([l('poulet', 100)], catalogue, table);
    expect(partEnergie(b, 'proteines').bas).toBeCloseTo(80);
    expect(formaterIntervalle({ min: 412.4, max: 412.4 }, 'kcal')).toBe('412');
    expect(formaterIntervalle({ min: 0, max: 0.44 }, 'lipides')).toBe('0 à 0,4');
    expect(formaterIntervalle({ min: 12.04, max: null }, 'proteines')).toBe('≥ 12');
  });
});

describe('objectifs', () => {
  it('position d’une valeur par rapport à une plage', () => {
    expect(positionObjectif({ min: 1700, max: 1700 }, 1650, 1750)).toBe('dans');
    expect(positionObjectif({ min: 1200, max: 1300 }, 1650, 1750)).toBe('sous');
    expect(positionObjectif({ min: 1800, max: null }, 1650, 1750)).toBe('au-dessus');
    expect(positionObjectif({ min: 1600, max: null }, 1650, 1750)).toBe('indetermine');
    expect(positionObjectif({ min: 1600, max: 1600 })).toBe('sans-objectif');
    expect(positionObjectif({ min: 110, max: 110 }, 100)).toBe('dans');
  });
});

describe('avec la table Ciqual 2025 et le plan d’exemple', () => {
  const vraie = lireTableCiqual(JSON.parse(readFileSync(new URL('../../public/data/ciqual-2025.json', import.meta.url), 'utf8')) as FichierCiqual);
  const p = validerPlan(plan);
  if (!p.ok) throw new Error('fixture invalide');
  const pl: Plan = p.plan;

  it('table complète et codes du plan présents', () => {
    expect(vraie.aliments.size).toBe(3484);
    expect(vraie.source.licence).toMatch(/Etalab/);
    const absents = pl.ingredients.filter((i) => i.ciqual && !vraie.aliments.has(i.ciqual.code));
    expect(absents).toEqual([]);
  });

  it('lentilles vertes sèches : 213,33 g × 327 kcal/100 g', () => {
    const c = new Map(pl.ingredients.map((i) => [i.id, i]));
    const b = bilanLignes([l('lentilles-vertes', 213.33)], c, vraie);
    expect(b.valeurs.kcal.min).toBeCloseTo(697.6, 1);
    expect(b.valeurs.proteines.min).toBeCloseTo(53.5, 1);
  });

  it('recherche sans accents', () => {
    expect(chercherAliments(vraie, 'lentille verte').map((a) => a.code)).toContain('20585');
    expect(chercherAliments(vraie, 'oeuf cru')[0]!.code).toBe('22000');
  });

  it('journées de la semaine 1 : repas comptés par personne', () => {
    const jours = nutritionSemaine(pl, pl.semaines[0]!, vraie, [
      { id: 'personne-a', coefFeculents: 0.75 },
      { id: 'personne-b', coefFeculents: 1 },
    ]);
    const j10 = jours.find((j) => j.date === '2026-11-10')!;
    // Mujaddara (midi) pour la personne A seulement ; sheet-pan (soir) pour les deux.
    expect(j10.parPersonne.get('personne-a')!.repas.map((r) => r.recette)).toEqual(['sheet-pan-poulet-butternut', 'mujaddara']);
    expect(j10.parPersonne.get('personne-b')!.repas.map((r) => r.recette)).toEqual(['sheet-pan-poulet-butternut']);
    // Les quantités non précisées (herbes, huile…) rendent le total incomplet : signalé.
    expect(j10.parPersonne.get('personne-a')!.bilan.complet).toBe(false);
    expect(j10.parPersonne.get('personne-a')!.bilan.valeurs.kcal.max).toBeNull();
    expect(j10.parPersonne.get('personne-a')!.bilan.valeurs.kcal.min).toBeGreaterThan(0);
  });
});
