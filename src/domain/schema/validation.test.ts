import { describe, expect, it } from 'vitest';
import { fixtureBrute } from '../test-utils';
import { formaterChemin, validerPlan } from './validation';

describe('validerPlan', () => {
  it('accepte la fixture de novembre (semaine 1)', () => {
    const r = validerPlan(fixtureBrute());
    expect(r.ok).toBe(true);
  });

  it('accepte une chaîne JSON', () => {
    expect(validerPlan(JSON.stringify(fixtureBrute())).ok).toBe(true);
  });

  it('refuse un texte qui n’est pas du JSON, avec un message clair', () => {
    const r = validerPlan('{ pas du json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]!.message).toMatch(/pas du JSON valide/);
  });

  it('refuse un fichier sans le bon « format »', () => {
    const r = validerPlan({ hello: 'world' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]!.chemin).toBe('format');
  });

  it('signale une recette inexistante avec le chemin et la semaine', () => {
    const brut = fixtureBrute() as any;
    brut.semaines[0].plats[1].recette = 'riz-saute';
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs).toContainEqual({
        chemin: 'semaines[0].plats[1].recette (semaine 1)',
        message: 'la recette « riz-saute » n’existe pas dans « recettes ».',
      });
    }
  });

  it('signale un ingrédient inconnu dans une recette, avec l’id de la recette', () => {
    const brut = fixtureBrute() as any;
    brut.recettes[0].ingredients[0].ingredient = 'quinoa';
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs[0]!.chemin).toBe('recettes[0].ingredients[0].ingredient (« salade-lentilles-butternut-feta »)');
      expect(r.erreurs[0]!.message).toContain('« quinoa »');
    }
  });

  it('signale les identifiants en double', () => {
    const brut = fixtureBrute() as any;
    brut.ingredients.push({ ...brut.ingredients[0] });
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.some((e) => /en double/.test(e.message))).toBe(true);
  });

  it('refuse une unité hors liste (message en français listant les valeurs)', () => {
    const brut = fixtureBrute() as any;
    brut.recettes[0].ingredients[0].unite = 'grammes';
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs[0]!.chemin).toContain('recettes[0].ingredients[0].unite');
      expect(r.erreurs[0]!.message).toMatch(/"g"/);
    }
  });

  it('refuse une heure de session mal formée', () => {
    const brut = fixtureBrute() as any;
    brut.semaines[0].session.etapes[0].debut = '5 min';
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]!.message).toMatch(/h:mm/);
  });

  it('refuse un repas antérieur à la session', () => {
    const brut = fixtureBrute() as any;
    brut.semaines[0].plats[0].repas[0].date = '2026-11-07';
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]!.message).toMatch(/antérieur à la session/);
  });

  it('refuse une tâche de Gantt non déclarée', () => {
    const brut = fixtureBrute() as any;
    brut.semaines[0].session.etapes[0].tache = 'inconnue';
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
  });

  it('accepte une quantité null (non précisée) mais pas une quantité négative', () => {
    const brut = fixtureBrute() as any;
    brut.recettes[0].ingredients[0].quantite = -3;
    expect(validerPlan(brut).ok).toBe(false);
  });
});

describe('avertissements', () => {
  it('liste les quantités non précisées et signale un dimanche manquant', () => {
    const brut = fixtureBrute() as any;
    brut.semaines[0].dateSession = '2026-11-07';
    brut.semaines[0].plats.forEach((p: any) => p.repas?.forEach((r: any) => (r.date = r.date < '2026-11-07' ? '2026-11-07' : r.date)));
    const r = validerPlan(brut);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.avertissements.some((a) => /n’est pas un dimanche/.test(a.message))).toBe(true);
      expect(r.avertissements.some((a) => /non précisée/.test(a.message))).toBe(true);
    }
  });

  it('signale plus de portions mangées que cuisinées', () => {
    const brut = fixtureBrute() as any;
    brut.semaines[0].plats[1].repas.push({ date: '2026-11-10', moment: 'midi' });
    const r = validerPlan(brut);
    expect(r.ok && r.avertissements.some((a) => /4 portions pour 2/.test(a.message))).toBe(true);
  });
});

describe('formaterChemin', () => {
  it('écrit les indices entre crochets', () => {
    expect(formaterChemin(['semaines', 1, 'plats', 2, 'recette'])).toBe('semaines[1].plats[2].recette');
  });
});

describe('clés inconnues', () => {
  it('refuse une clé non prévue par le schéma (évite de perdre une donnée en silence)', () => {
    const brut = fixtureBrute() as any;
    brut.recettes[0].nutritionParPortion = { kcal: 500 };
    const r = validerPlan(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs[0]!.chemin).toBe('recettes[0] (« salade-lentilles-butternut-feta »)');
      expect(r.erreurs[0]!.message).toContain('nutritionParPortion');
    }
  });
});
