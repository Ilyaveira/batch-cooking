import { describe, expect, it } from 'vitest';
import { coursesSemaine } from './courses';
import {
  appliquerInfosIngredients,
  appliquerRecettesMois,
  creerIdIngredient,
  etapesCitant,
  lireQuantite,
  planDeSemaine,
  planExporte,
  recettesDeSemaine,
  remplacerDansRecettes,
  verifierIngredientCree,
  verifierLignes,
  type InfosIngredientPerso,
  type RecettePerso,
} from './modifications';
import type { Plan } from './schema/plan';
import { validerPlan } from './schema/validation';
import { aSortir } from './session';
import { fixturePlan } from './test-utils';

const plan = fixturePlan();
const s1 = plan.semaines[0]!;
const recette = (p: Plan, id: string) => p.recettes.find((r) => r.id === id)!;
const ligneCourses = (p: Plan, id: string) =>
  coursesSemaine(p, p.semaines[0]!)
    .flatMap((r) => r.lignes)
    .find((l) => l.ingredient.id === id);

/** Plan d'une autre semaine (même recettes) pour vérifier qu'une modif ponctuelle reste locale. */
const avecSemaine2 = (): Plan => ({
  ...plan,
  semaines: [...plan.semaines, { ...s1, numero: 2, dateSession: '2026-11-15', session: undefined, plats: s1.plats.map((p) => ({ ...p, repas: undefined })) }],
});

const feta120: RecettePerso = {
  mois: '2026-11',
  semaine: 1,
  recetteId: 'salade-lentilles-butternut-feta',
  ingredients: recette(plan, 'salade-lentilles-butternut-feta').ingredients.map((l) => (l.ingredient === 'feta' ? { ...l, quantite: 120 } : l)),
};

describe('modifier les quantités', () => {
  it('ponctuel (semaine 1) : feta 150 → 120 g, les courses passent de 400 à 370 g', () => {
    expect(ligneCourses(plan, 'feta')!.quantiteBase).toBe(400);
    const p = planDeSemaine(plan, s1, [feta120]).plan;
    expect(ligneCourses(p, 'feta')!.quantiteBase).toBe(370);
  });

  it('ponctuel : n’affecte pas les autres semaines', () => {
    const deux = avecSemaine2();
    const s2 = planDeSemaine(deux, deux.semaines[1]!, [feta120]).plan;
    expect(recette(s2, 'salade-lentilles-butternut-feta').ingredients.find((l) => l.ingredient === 'feta')!.quantite).toBe(150);
  });

  it('permanent (mois) : appliqué à toutes les semaines ; la semaine garde la priorité', () => {
    const mois = appliquerRecettesMois(avecSemaine2(), [{ ...feta120, semaine: 0, ingredients: feta120.ingredients.map((l) => (l.ingredient === 'feta' ? { ...l, quantite: 100 } : l)) }]).plan;
    expect(recette(mois, 'salade-lentilles-butternut-feta').ingredients.find((l) => l.ingredient === 'feta')!.quantite).toBe(100);
    const semaine1 = planDeSemaine(mois, mois.semaines[0]!, [feta120]).plan;
    expect(recette(semaine1, 'salade-lentilles-butternut-feta').ingredients.find((l) => l.ingredient === 'feta')!.quantite).toBe(120);
  });

  it('lire une quantité saisie', () => {
    expect(lireQuantite('120')).toBe(120);
    expect(lireQuantite('0,5')).toBe(0.5);
    expect(lireQuantite('  ')).toBeNull();
    expect(lireQuantite('-3')).toBe('invalide');
    expect(lireQuantite('beaucoup')).toBe('invalide');
  });
});

describe('ajouter, retirer, remplacer', () => {
  it('ajouter un ingrédient créé dans l’app : il entre dans le catalogue et dans les courses', () => {
    const infos: InfosIngredientPerso[] = [{ id: 'potimarron', nom: 'Potimarron', rayon: 'fruits-legumes', cree: true }];
    const cat = appliquerInfosIngredients(plan, infos);
    const lignes = [...recette(cat, 'crudites-apero').ingredients, { ingredient: 'potimarron', quantite: 1, unite: 'piece' as const }];
    const p = planDeSemaine(cat, cat.semaines[0]!, [{ mois: '2026-11', semaine: 1, recetteId: 'crudites-apero', ingredients: lignes }]).plan;
    expect(ligneCourses(p, 'potimarron')!.quantiteBase).toBe(1);
    expect(aSortir(p, p.semaines[0]!).parStockage.find((g) => g.stockage === 'legumes')!.lignes.some((l) => l.ingredient.id === 'potimarron')).toBe(true);
  });

  it('retirer la ciboulette du cake : elle ne vient plus que de la salade et des courses en plus', () => {
    const lignes = recette(plan, 'cake-tomates-sechees-feta').ingredients.filter((l) => l.ingredient !== 'ciboulette');
    const p = planDeSemaine(plan, s1, [{ mois: '2026-11', semaine: 1, recetteId: 'cake-tomates-sechees-feta', ingredients: lignes }]).plan;
    expect(ligneCourses(p, 'ciboulette')!.provenances.map((x) => x.origine)).not.toContain('Cake salé tomates séchées et feta');
  });

  it('remplacer la butternut par du potimarron pour tout le mois (quantités conservées)', () => {
    const cat = appliquerInfosIngredients(plan, [{ id: 'potimarron', nom: 'Potimarron', rayon: 'fruits-legumes', cree: true }]);
    const persos = remplacerDansRecettes(cat, 'butternut', 'potimarron', cat.recettes.map((r) => r.id), 0);
    expect(persos.map((p) => p.recetteId)).toEqual(['salade-lentilles-butternut-feta', 'sheet-pan-poulet-butternut']);
    const p = appliquerRecettesMois(cat, persos).plan;
    expect(ligneCourses(p, 'butternut')).toBeUndefined();
    expect(ligneCourses(p, 'potimarron')!.quantiteBase).toBe(1300);
    // Les textes des étapes ne sont pas réécrits : l'app le signale.
    expect(etapesCitant(p, 'butternut')).toContain('semaine 1, 0:12');
  });

  it('remplacer dans les recettes d’une semaine seulement', () => {
    expect(recettesDeSemaine(s1)).toHaveLength(7);
    const persos = remplacerDansRecettes(plan, 'feta', 'fromage-blanc', ['cake-tomates-sechees-feta'], 1);
    expect(persos).toHaveLength(1);
    expect(persos[0]!.ingredients.some((l) => l.ingredient === 'feta')).toBe(false);
  });
});

describe('infos d’un ingrédient (mémorisées pour tous les mois)', () => {
  const laitAuFrigo: InfosIngredientPerso[] = [{ id: 'lait-coco', stockage: 'frigo' }];

  it('le lait de coco rangé au frigo apparaît au frigo dans « à sortir »', () => {
    const p = appliquerInfosIngredients(plan, laitAuFrigo);
    const frigo = aSortir(p, p.semaines[0]!).parStockage.find((g) => g.stockage === 'frigo')!;
    expect(frigo.lignes.some((l) => l.ingredient.id === 'lait-coco')).toBe(true);
  });

  it('s’applique à un autre mois qui contient le même ingrédient', () => {
    const decembre = appliquerInfosIngredients({ ...plan, mois: '2026-12' }, laitAuFrigo);
    expect(decembre.ingredients.find((i) => i.id === 'lait-coco')!.stockage).toBe('frigo');
  });

  it('changer le rayon et le nom retrie les courses', () => {
    const p = appliquerInfosIngredients(plan, [{ id: 'tomates-sechees', nom: 'Tomates séchées à l’huile', rayon: 'cremerie' }]);
    const cremerie = coursesSemaine(p, p.semaines[0]!).find((r) => r.rayon === 'cremerie')!;
    expect(cremerie.lignes.some((l) => l.ingredient.nom === 'Tomates séchées à l’huile')).toBe(true);
  });

  it('identifiant unique pour un ingrédient créé, et contrôles', () => {
    expect(creerIdIngredient('Potimarron', new Set())).toBe('potimarron');
    expect(creerIdIngredient('Œufs bio', new Set(['oeufs-bio']))).toBe('oeufs-bio-2');
    expect(() => verifierIngredientCree({ id: 'x', nom: ' ', rayon: 'epicerie', cree: true })).toThrow(/nom/);
    expect(() => verifierIngredientCree({ id: 'x', nom: 'X', cree: true })).toThrow(/rayon/);
  });
});

describe('contrôle des lignes et réimport', () => {
  const connus = new Set(plan.ingredients.map((i) => i.id));
  it('refuse une recette vide, un ingrédient inconnu ou une quantité négative', () => {
    expect(() => verifierLignes([], connus)).toThrow(/au moins un/);
    expect(() => verifierLignes([{ ingredient: 'licorne', quantite: 1, unite: 'g' }], connus)).toThrow(/inconnu/);
    expect(() => verifierLignes([{ ingredient: 'feta', quantite: -1, unite: 'g' }], connus)).toThrow(/supérieure à 0/);
    expect(() => verifierLignes([{ ingredient: 'feta', quantite: null, unite: 'g' }], connus)).not.toThrow();
  });

  it('réimport : une ligne citant un ingrédient disparu est ignorée et signalée', () => {
    const r = appliquerRecettesMois(plan, [{ ...feta120, semaine: 0, ingredients: [...feta120.ingredients, { ingredient: 'disparu', quantite: 1, unite: 'piece' }] }]);
    expect(r.ignorees).toEqual(['Salade de lentilles, butternut et feta : « disparu » n’existe plus dans le plan']);
    expect(recette(r.plan, 'salade-lentilles-butternut-feta').ingredients).toHaveLength(13);
  });
});

describe('export', () => {
  it('modif du mois appliquée, modif ponctuelle en recette dérivée « -s1 » ; plan valide', () => {
    const infos: InfosIngredientPerso[] = [
      { id: 'potimarron', nom: 'Potimarron', rayon: 'fruits-legumes', cree: true },
      { id: 'lait-coco', stockage: 'frigo' },
    ];
    const cat = appliquerInfosIngredients(plan, infos);
    const persos = [...remplacerDansRecettes(cat, 'butternut', 'potimarron', ['sheet-pan-poulet-butternut'], 0), feta120];
    const e = planExporte(plan, infos, persos);
    const r = validerPlan(JSON.parse(JSON.stringify(e)));
    expect(r.ok ? [] : r.erreurs).toEqual([]);
    expect(e.semaines[0]!.plats[0]!.recette).toBe('salade-lentilles-butternut-feta-s1');
    expect(recette(e, 'salade-lentilles-butternut-feta-s1').ingredients.find((l) => l.ingredient === 'feta')!.quantite).toBe(120);
    expect(recette(e, 'sheet-pan-poulet-butternut').ingredients.some((l) => l.ingredient === 'potimarron')).toBe(true);
    expect(e.ingredients.find((i) => i.id === 'lait-coco')!.stockage).toBe('frigo');
  });
});
