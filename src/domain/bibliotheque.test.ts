import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import plan from '../../fixtures/novembre-2026-semaine1.json';
import { appliquerEtiquettes, exporterBibliotheque, lireEtiquettesLibres, trierSaisons } from './bibliotheque';
import { lireTableCiqual, type FichierCiqual } from './nutrition';
import { recetteSchema } from './schema/plan';
import { validerPlan } from './schema/validation';

const v = validerPlan(plan);
if (!v.ok) throw new Error('fixture invalide');
const p = v.plan;
const table = lireTableCiqual(JSON.parse(readFileSync(new URL('../../public/data/ciqual-2025.json', import.meta.url), 'utf8')) as FichierCiqual);
const bib = p.recettes.map((recette) => ({
  recette,
  ingredients: p.ingredients.filter((i) => recette.ingredients.some((l) => l.ingredient === i.id)),
}));

describe('étiquettes modifiées', () => {
  it('remplacent saisons et étiquettes libres du plan ; vides = retirées', () => {
    const r = p.recettes[0]!;
    const m = appliquerEtiquettes(r, { recetteId: r.id, saisons: ['hiver'], libres: ['lunchbox'] });
    expect(m.tags?.saisons).toEqual(['hiver']);
    expect(m.tags?.libres).toEqual(['lunchbox']);
    expect(m.tags?.vegetarien).toBe(true);
    expect(appliquerEtiquettes(r, { recetteId: r.id, saisons: [], libres: [] }).tags?.saisons).toBeUndefined();
    expect(appliquerEtiquettes(r, undefined)).toBe(r);
  });

  it('lecture de la saisie et ordre des saisons', () => {
    expect(lireEtiquettesLibres(' rapide, , Rapide, se congèle ')).toEqual(['rapide', 'se congèle']);
    expect(trierSaisons(['hiver', 'printemps'])).toEqual(['printemps', 'hiver']);
  });
});

describe('export de la bibliothèque pour Claude', () => {
  const e = exporterBibliotheque({
    recettes: bib,
    infos: [{ id: 'oeuf', masseParUnite: { piece: 50 } }],
    etiquettes: [{ recetteId: 'crudites-apero', saisons: ['printemps', 'ete'], libres: [] }],
    notes: [{ id: 'n1', recetteId: 'mujaddara', personneId: 'personne-a', date: '2026-11-12', gout: 4, facilite: 5, commentaire: 'top' }],
    personnes: new Map([['personne-a', 'A']]),
    table,
    seuilGlucidesPct: 26,
    maintenant: new Date('2026-11-14T10:00:00Z'),
  });

  it('recettes complètes au format du plan, saisons, notes', () => {
    expect(e.format).toBe('batch-cooking-bibliotheque');
    expect(e.recettes).toHaveLength(p.recettes.length);
    for (const r of e.recettes) expect(recetteSchema.safeParse(r.recette).success).toBe(true);
    expect(e.recettes.find((r) => r.recette.id === 'crudites-apero')!.saisons).toEqual(['printemps', 'ete']);
    expect(e.recettes.find((r) => r.recette.id === 'cake-tomates-sechees-feta')!.saisons).toBe('non renseignée');
    const m = e.recettes.find((r) => r.recette.id === 'mujaddara')!;
    expect(m.notes).toMatchObject({ nbNotes: 1, gout: 4, facilite: 5 });
    expect(m.notes!.detail[0]).toMatchObject({ personne: 'A', commentaire: 'top' });
  });

  it('ingrédients avec les infos de l’app ; nutrition par portion avec sa source', () => {
    const s = e.recettes.find((r) => r.recette.id === 'salade-lentilles-butternut-feta')!;
    expect(s.ingredients.find((i) => i.id === 'oeuf')!.masseParUnite).toEqual({ piece: 50 });
    expect(e.sourceNutrition!.licence).toMatch(/Etalab/);
    expect(s.nutrition!.complet).toBe(false);
    expect(s.nutrition!.nonComptes.join(' ')).toMatch(/Cottage cheese \(sans-code\)/);
    expect(s.nutrition!.parPortion.kcal.max).toBeNull();
    expect(s.nutrition!.parPortion.kcal.min).toBeGreaterThan(0);
  });

  it('sans table Ciqual : export sans nutrition', () => {
    const sans = exporterBibliotheque({ recettes: bib, infos: [], etiquettes: [], notes: [], personnes: new Map(), table: null, seuilGlucidesPct: 26 });
    expect(sans.sourceNutrition).toBeNull();
    expect(sans.recettes[0]!.nutrition).toBeNull();
  });
});
