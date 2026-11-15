import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import plan from '../../fixtures/novembre-2026-semaine1.json';
import { classerMesureUsda, proposerMasses, type FichierPortions } from './portions-usda';
import { aCompleter, bilanLignes, lireTableCiqual, manquesDuPlan, type FichierCiqual } from './nutrition';
import { validerPlan } from './schema/validation';

const portions = JSON.parse(readFileSync(new URL('../../public/data/portions-usda.json', import.meta.url), 'utf8')) as FichierPortions;
const table = lireTableCiqual(JSON.parse(readFileSync(new URL('../../public/data/ciqual-2025.json', import.meta.url), 'utf8')) as FichierCiqual);
const v = validerPlan(plan);
if (!v.ok) throw new Error('fixture invalide');
const p = v.plan;

describe('mesures USDA', () => {
  it('classement des mesures ménagères', () => {
    expect(classerMesureUsda('undetermined', 'tbsp')).toEqual({ unite: 'cas', volume: 'tbsp' });
    expect(classerMesureUsda('undetermined', 'tbsp chopped')).toEqual({ unite: 'cas' });
    expect(classerMesureUsda('undetermined', 'tsp or 1 packet')).toEqual({ unite: 'cac', volume: 'tsp' });
    expect(classerMesureUsda('undetermined', 'cup, sections')).toEqual({});
    expect(classerMesureUsda('undetermined', 'large')).toEqual({ unite: 'piece' });
    expect(classerMesureUsda('undetermined', 'eggplant, unpeeled (approx 1-1/4 lb)')).toEqual({ unite: 'piece' });
    expect(classerMesureUsda('undetermined', 'clove')).toEqual({ unite: 'gousse' });
    expect(classerMesureUsda('undetermined', 'NLEA serving')).toEqual({});
    expect(classerMesureUsda('undetermined', 'bunch')).toEqual({});
  });

  it('source citée et licence', () => {
    expect(portions.source.licence).toMatch(/CC0/);
    expect(portions.source.licenceUrl).toBe('https://fdc.nal.usda.gov/api-guide');
  });

  it('propositions par unité, valeurs recopiées de la table USDA', () => {
    // Egg, whole, raw, fresh : 1 large = 50 g, 1 medium = 44 g (fdcId 171287).
    const oeuf = proposerMasses(portions, '22000', 'piece');
    expect(oeuf.find((m) => m.libelle === '1 large')?.g).toBe(50);
    expect(oeuf.find((m) => m.libelle === '1 medium')?.g).toBe(44);
    // Oil, olive : 1 tablespoon = 13.5 g, 1 tsp = 4.5 g.
    expect(proposerMasses(portions, '17270', 'cas')).toEqual([{ g: 13.5, libelle: '1 tablespoon' }]);
    expect(proposerMasses(portions, '17270', 'cac')[0]!.g).toBe(4.5);
    // Garlic, raw : 1 clove = 3 g (« 3 cloves = 9 g » non dédoublé).
    expect(proposerMasses(portions, '11000', 'gousse')).toEqual([{ g: 3, libelle: '1 clove' }]);
    // Lait de coco en cl : 15 g par tbsp de 14,7868 ml → 1,014 g/ml → 10,1 g par cl.
    expect(proposerMasses(portions, '18041', 'cl')[0]!.g).toBeCloseTo(10.1, 1);
  });

  it('rien pour botte, sachet, pincée, ni pour un aliment hors table de correspondance', () => {
    expect(proposerMasses(portions, '20045', 'botte')).toEqual([]);
    expect(proposerMasses(portions, '11046', 'sachet')).toEqual([]);
    expect(proposerMasses(portions, '11042', 'pincee')).toEqual([]);
    expect(proposerMasses(portions, '12066', 'piece')).toEqual([]);
    expect(proposerMasses(portions, undefined, 'piece')).toEqual([]);
    expect(proposerMasses(null, '22000', 'piece')).toEqual([]);
  });

  it('chaque aliment Ciqual de la correspondance existe dans Ciqual 2025', () => {
    expect(Object.keys(portions.aliments).filter((c) => !table.aliments.has(c))).toEqual([]);
  });
});

describe('ce qui manque dans le plan', () => {
  it('œufs : masse « pièce » ; cumin : quantité non précisée ; cottage cheese : sans aliment', () => {
    const m = new Map(manquesDuPlan(p, table).map((x) => [x.ingredient.id, x]));
    expect(m.get('oeuf')!.massesManquantes).toEqual(['piece']);
    expect(m.get('cumin')!.quantitesNonPrecisees.map((q) => q.recetteId)).toContain('salade-lentilles-butternut-feta');
    expect(m.get('cottage-cheese')!.sansCode).toBe(true);
    expect(m.get('lentilles-vertes')!.massesManquantes).toEqual([]);
    expect(aCompleter(m.get('lentilles-vertes')!)).toBe(false);
    expect(aCompleter(m.get('oeuf')!)).toBe(true);
  });

  it('un ingrédient négligé n’est plus à compléter', () => {
    const m = manquesDuPlan(p, table, new Set(['cumin'])).find((x) => x.ingredient.id === 'cumin')!;
    expect(m.negligeable).toBe(true);
    expect(aCompleter(m)).toBe(false);
  });

  it('calcul : un ingrédient négligé n’est pas compté et ne rend pas le calcul incomplet', () => {
    const catalogue = new Map(p.ingredients.map((i) => [i.id, i]));
    const lignes = [
      { ingredient: 'lentilles-vertes', quantite: 100, unite: 'g' as const },
      { ingredient: 'cumin', quantite: null, unite: 'pincee' as const },
    ];
    expect(bilanLignes(lignes, catalogue, table).complet).toBe(false);
    const b = bilanLignes(lignes, catalogue, table, new Set(['cumin']));
    expect(b.complet).toBe(true);
    expect(b.negligesParChoix).toEqual(['Cumin']);
    expect(b.valeurs.kcal).toEqual({ min: 327, max: 327 });
  });
});
