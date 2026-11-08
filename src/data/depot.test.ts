import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixturePlan } from '../domain/test-utils';
import { BaseBatch } from './db';
import {
  cles,
  cocher,
  cochagesAvecPrefixe,
  enregistrerReglages,
  exporterSauvegarde,
  importerPlan,
  lireReglages,
  listerPlans,
  restaurerSauvegarde,
  supprimerPlan,
} from './depot';

let base: BaseBatch;
beforeEach(() => {
  base = new BaseBatch(`test-${Math.random()}`);
});
afterEach(async () => {
  await base.delete();
});

describe('dépôt', () => {
  it('importe un plan, alimente la bibliothèque et ajoute les personnes', async () => {
    const bilan = await importerPlan(fixturePlan(), base);
    expect(bilan).toEqual({ mois: '2026-11', remplace: false, recettes: 7, personnesAjoutees: ['Personne A', 'Personne B'] });
    expect((await listerPlans(base)).map((p) => p.id)).toEqual(['2026-11']);
    const mujaddara = await base.recettes.get('mujaddara');
    expect(mujaddara!.ingredients.map((i) => i.id)).toContain('riz-basmati');
  });

  it('réimporter garde les exclusions saisies et les cases cochées', async () => {
    await importerPlan(fixturePlan(), base);
    const r = await lireReglages(base);
    await enregistrerReglages({ ...r, personnes: r.personnes.map((p) => ({ ...p, exclusions: ['fenouil'] })) }, base);
    await cocher(cles.courses('2026-11', 1, 'feta|masse'), true, base);

    const bilan = await importerPlan(fixturePlan(), base);
    expect(bilan.remplace).toBe(true);
    expect(bilan.personnesAjoutees).toEqual([]);
    expect((await lireReglages(base)).personnes[0]!.exclusions).toEqual(['fenouil']);
    expect(await cochagesAvecPrefixe(cles.prefixeCourses('2026-11', 1), base)).toEqual(
      new Set(['2026-11|courses|1|feta|masse']),
    );
  });

  it('supprimer un plan efface aussi ses cases cochées', async () => {
    await importerPlan(fixturePlan(), base);
    await cocher(cles.etape('2026-11', 1, 's1-01'), true, base);
    await supprimerPlan('2026-11', base);
    expect(await listerPlans(base)).toEqual([]);
    expect(await base.cochages.count()).toBe(0);
  });

  it('exporte puis restaure une sauvegarde complète', async () => {
    await importerPlan(fixturePlan(), base);
    await cocher(cles.placard('2026-11', 'sel'), true, base);
    const s = JSON.parse(JSON.stringify(await exporterSauvegarde(base)));

    const autre = new BaseBatch(`test-${Math.random()}`);
    await restaurerSauvegarde(s, autre);
    expect(await autre.plans.count()).toBe(1);
    expect(await autre.recettes.count()).toBe(7);
    expect(await cochagesAvecPrefixe(cles.prefixePlacard('2026-11'), autre)).toEqual(new Set(['2026-11|placard|0|sel']));
    await autre.delete();
  });

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await expect(restaurerSauvegarde({ format: 'autre' } as never, base)).rejects.toThrow(/pas une sauvegarde/);
  });
});
