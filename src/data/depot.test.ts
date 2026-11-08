import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixturePlan } from '../domain/test-utils';
import Dexie from 'dexie';
import { BaseBatch } from './db';
import {
  cles,
  cocher,
  cochagesAvecPrefixe,
  ajouterNotes,
  enregistrerPersonnalisation,
  listerNotes,
  notesDeRecette,
  supprimerNote,
  enregistrerReglages,
  lirePersonnalisation,
  personnalisationsDuMois,
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

  it('garde l’ordre modifié au réimport, l’efface avec le plan, et le sauvegarde', async () => {
    const perso = { ordre: ['s1-02', 's1-01'], heures: { 's1-01': '0:01' } };
    await importerPlan(fixturePlan(), base);
    await enregistrerPersonnalisation('2026-11', 1, perso, base);
    await importerPlan(fixturePlan(), base);
    expect(await lirePersonnalisation('2026-11', 1, base)).toEqual(perso);
    expect((await personnalisationsDuMois('2026-11', base)).get(1)).toEqual(perso);

    const s = JSON.parse(JSON.stringify(await exporterSauvegarde(base)));
    const autre = new BaseBatch(`test-${Math.random()}`);
    await restaurerSauvegarde(s, autre);
    expect(await lirePersonnalisation('2026-11', 1, autre)).toEqual(perso);
    // Une sauvegarde d'avant la fonctionnalité (sans le champ) reste restaurable.
    delete s.personnalisations;
    await restaurerSauvegarde(s, autre);
    expect(await lirePersonnalisation('2026-11', 1, autre)).toBeNull();
    await autre.delete();

    await enregistrerPersonnalisation('2026-11', 1, null, base);
    expect(await lirePersonnalisation('2026-11', 1, base)).toBeNull();
    await enregistrerPersonnalisation('2026-11', 1, perso, base);
    await supprimerPlan('2026-11', base);
    expect(await lirePersonnalisation('2026-11', 1, base)).toBeNull();
  });

  it('migre une base v1 (déjà installée sur un téléphone) sans perdre le plan', async () => {
    const nom = `test-v1-${Math.random()}`;
    const v1 = new Dexie(nom);
    v1.version(1).stores({ plans: 'id, majLe', recettes: 'id, majLe, moisOrigine', cochages: 'cle, majLe', reglages: 'cle' });
    await v1.table('plans').put({ id: '2026-11', plan: fixturePlan(), importeLe: 1, majLe: 1, appareil: 'x' });
    v1.close();
    const v2 = new BaseBatch(nom);
    expect((await listerPlans(v2)).map((p) => p.id)).toEqual(['2026-11']);
    await enregistrerPersonnalisation('2026-11', 1, { ordre: ['s1-01'], heures: {} }, v2);
    expect(await lirePersonnalisation('2026-11', 1, v2)).not.toBeNull();
    await v2.delete();
  });

  it('enregistre tous les champs d’une personnalisation (textes, scissions, fusions)', async () => {
    const perso = {
      ordre: ['s1-02', 's1-01'],
      heures: {},
      textes: { 's1-02': { texte: 'Eau salée.', details: ['Couvercle'] } },
      ajouts: { 's1-02-b': { id: 's1-02-b', source: 's1-02', debut: '0:00', poste: 'feux' as const, actifMin: 0, texte: 'Suite.' } },
      groupes: { 's1-01': 's1-01' },
    };
    await enregistrerPersonnalisation('2026-11', 1, perso, base);
    expect(await lirePersonnalisation('2026-11', 1, base)).toEqual(perso);
    expect((await personnalisationsDuMois('2026-11', base)).get(1)).toEqual(perso);
  });

  it('enregistre des notes, les liste par recette, les supprime et les sauvegarde', async () => {
    const ids = await ajouterNotes(
      [
        { recetteId: 'mujaddara', personneId: 'a', date: '2026-11-10', facilite: 4, gout: 5, commentaire: 'à refaire' },
        { recetteId: 'mujaddara', personneId: 'b', date: '2026-11-10', facilite: null, gout: 3 },
      ],
      base,
    );
    expect(ids).toHaveLength(2);
    expect((await notesDeRecette('mujaddara', base)).map((n) => n.gout).sort()).toEqual([3, 5]);
    await supprimerNote(ids[1]!, base);
    expect(await listerNotes(base)).toHaveLength(1);
    // Une note invalide n'écrit rien.
    await expect(ajouterNotes([{ recetteId: 'x', personneId: 'a', date: '2026-11-10', facilite: 9, gout: 3 }], base)).rejects.toThrow();
    expect(await listerNotes(base)).toHaveLength(1);

    const s = JSON.parse(JSON.stringify(await exporterSauvegarde(base)));
    const autre = new BaseBatch(`test-${Math.random()}`);
    await restaurerSauvegarde(s, autre);
    expect((await listerNotes(autre))[0]!.commentaire).toBe('à refaire');
    await autre.delete();
  });

  it('supprimer un plan garde les notes (les recettes restent dans la bibliothèque)', async () => {
    await importerPlan(fixturePlan(), base);
    await ajouterNotes([{ recetteId: 'mujaddara', personneId: 'a', date: '2026-11-10', facilite: 4, gout: 5 }], base);
    await supprimerPlan('2026-11', base);
    expect(await listerNotes(base)).toHaveLength(1);
  });
});
