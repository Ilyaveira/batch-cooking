import { describe, expect, it } from 'vitest';
import { geometrieGantt, LARGEUR_MIN_BARRE, raccourcir } from './gantt';
import { appliquerPersonnalisation, changerHeure } from './reorganisation';
import { planning } from './session';
import { fixturePlan } from './test-utils';

const session = fixturePlan().semaines[0]!.session!;

describe('géométrie du Gantt (semaine 1)', () => {
  const g = geometrieGantt(planning(session), { largeur: 800, largeurLibelles: 192 });

  it('une ligne par tâche, comme le planning du document (14 lignes, ~2h10)', () => {
    expect(g.lignes).toHaveLength(14);
    expect(g.lignes[0]!.libelle).toBe('Four 210 °C, eau à bouillir');
    expect(g.finMin).toBe(135); // 2:12 arrondi au quart d'heure
  });

  it('l’axe couvre la largeur utile et gradue tous les quarts d’heure', () => {
    expect(g.x0 + g.finMin * g.echelle).toBeCloseTo(800 - 8);
    expect(g.graduations.map((t) => t.libelle)).toEqual(['0:00', '0:15', '0:30', '0:45', '1:00', '1:15', '1:30', '1:45', '2:00', '2:15']);
  });

  it('les lentilles : actif 0:05–0:08, cuisson 0:08–0:30, égouttage en alerte à 0:30', () => {
    const l = g.lignes.find((x) => x.id === 'lentilles')!;
    expect(l.barres.map((b) => [b.type, b.debut, b.fin])).toEqual([
      ['actif', 5, 8],
      ['passif', 8, 30],
      ['alerte', 30, 32],
    ]);
    expect(l.barres[1]!.x).toBeCloseTo(192 + 8 * g.echelle);
  });

  it('une alerte d’une minute reste visible (largeur minimale)', () => {
    const oignons = g.lignes.find((x) => x.id === 'oignons')!;
    expect(oignons.barres.filter((b) => b.type === 'alerte').every((b) => b.largeur >= LARGEUR_MIN_BARRE)).toBe(true);
    // Les alertes sont dessinées en dernier (au-dessus de la cuisson).
    expect(oignons.barres.at(-1)!.type).toBe('alerte');
  });

  it('en portrait (360 px), les graduations s’espacent à la demi-heure', () => {
    const p = geometrieGantt(planning(session), { largeur: 340, largeurLibelles: 110 });
    expect(p.graduations.map((t) => t.libelle)).toEqual(['0:00', '0:30', '1:00', '1:30', '2:00']);
  });

  it('suit les modifications faites dans l’app (four avancé à 0:45)', () => {
    const s = appliquerPersonnalisation(session, changerHeure(session, session, 's1-09', '0:45'));
    const four = geometrieGantt(planning(s), { largeur: 800, largeurLibelles: 192 }).lignes.find((x) => x.id === 'four')!;
    expect(four.barres.find((b) => b.type === 'passif')!.debut).toBe(48);
    expect(four.barres.filter((b) => b.type === 'alerte').map((b) => b.debut)).toEqual([61, 75]);
  });
});

describe('raccourcir', () => {
  it('coupe avec une ellipse au-delà de la place disponible', () => {
    expect(raccourcir('Lentilles vertes (25 min)', 200)).toBe('Lentilles vertes (25 min)');
    expect(raccourcir('Oignons du mujaddara (poêle)', 84)).toBe('Oignons du …');
  });
});
