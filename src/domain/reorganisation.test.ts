import { describe, expect, it } from 'vitest';
import { heureHorloge, minutesDepuisDebut } from './dates';
import {
  appliquerPersonnalisation,
  changerHeure,
  deplacerEtape,
  lireHeureSession,
  planAvecPersonnalisations,
  type Personnalisation,
} from './reorganisation';
import type { Session } from './schema/plan';
import { validerPlan } from './schema/validation';
import { etapesTriees } from './session';
import { fixturePlan } from './test-utils';

const plan = fixturePlan();
const origine = plan.semaines[0]!.session!;
const ids = (s: Session) => etapesTriees(s).map((e) => e.id);
const affichee = (p: Personnalisation | null) => appliquerPersonnalisation(origine, p);
const chronologique = (s: Session) =>
  s.etapes.every((e, i) => i === 0 || minutesDepuisDebut(e.debut) >= minutesDepuisDebut(s.etapes[i - 1]!.debut));

describe('déplacer une étape (flèches ou numéro)', () => {
  it('la place prise donne l’heure : brocolis vapeur (n° 13, 1:13) → n° 9 passe à 0:57 devant le four', () => {
    expect(ids(origine).indexOf('s1-13')).toBe(12);
    const p = deplacerEtape(origine, origine, 's1-13', 9)!;
    const s = affichee(p);
    expect(ids(s).slice(7, 10)).toEqual(['s1-08', 's1-13', 's1-09']);
    expect(s.etapes.find((e) => e.id === 's1-13')!.debut).toBe('0:57');
    expect(p.heures).toEqual({ 's1-13': '0:57' });
    expect(chronologique(s)).toBe(true);
  });

  it('descendre une étape la place après celle dont elle prend la place', () => {
    const s = affichee(deplacerEtape(origine, origine, 's1-03', 5));
    expect(ids(s).slice(2, 6)).toEqual(['s1-04', 's1-05', 's1-03', 's1-06']);
    expect(s.etapes.find((e) => e.id === 's1-03')!.debut).toBe('0:12');
    expect(chronologique(s)).toBe(true);
  });

  it('les flèches = une position ; enchaîner les déplacements reste cohérent', () => {
    let s = origine;
    const p1 = deplacerEtape(s, origine, 's1-08', 7); // ↑
    s = affichee(p1);
    const p2 = deplacerEtape(s, origine, 's1-08', 6); // ↑ encore
    s = affichee(p2);
    expect(ids(s).slice(4, 8)).toEqual(['s1-05', 's1-08', 's1-06', 's1-07']);
    expect(chronologique(s)).toBe(true);
    // La réorganisation repart de la session affichée : l'ordre stocké est bien celui affiché.
    expect(etapesTriees(s).map((e) => e.id)).toEqual(p2!.ordre);
  });

  it('refuse un numéro hors limites', () => {
    expect(() => deplacerEtape(origine, origine, 's1-03', 0)).toThrow(/entre 1 et 23/);
    expect(() => deplacerEtape(origine, origine, 's1-03', 24)).toThrow(/entre 1 et 23/);
    expect(() => deplacerEtape(origine, origine, 's1-03', 2.5)).toThrow();
  });

  it('ne rien changer = pas de personnalisation', () => {
    expect(deplacerEtape(origine, origine, 's1-03', 3)).toBeNull();
  });
});

describe('changer l’heure', () => {
  it('l’étape se replace d’elle-même : découpe (0:42) à 0:25 passe entre 0:20 et 0:30', () => {
    const s = affichee(changerHeure(origine, origine, 's1-08', '0:25'));
    expect(ids(s).slice(5, 8)).toEqual(['s1-06', 's1-08', 's1-07']);
    expect(chronologique(s)).toBe(true);
  });

  it('accepte les saisies usuelles du clavier de téléphone', () => {
    expect(lireHeureSession('0:25')).toBe('0:25');
    expect(lireHeureSession('1h30')).toBe('1:30');
    expect(lireHeureSession('1.05')).toBe('1:05');
    expect(lireHeureSession('1,5')).toBeNull(); // ambigu : 1 h 30 ou 1:05
    expect(lireHeureSession('1h5')).toBe('1:05');
    expect(lireHeureSession('130')).toBe('1:30');
    expect(lireHeureSession('25')).toBe('0:25');
    expect(lireHeureSession('1:75')).toBeNull();
    expect(lireHeureSession('midi')).toBeNull();
  });

  it('refuse une heure invalide sans rien modifier', () => {
    expect(() => changerHeure(origine, origine, 's1-08', '0:75')).toThrow(/h:mm/);
  });
});

describe('réimport et export', () => {
  it('garde les modifications, ignore les étapes disparues et insère les nouvelles selon leur heure', () => {
    const p = deplacerEtape(origine, origine, 's1-13', 9)!;
    const nouvelleSession: Session = {
      ...origine,
      etapes: [
        ...origine.etapes.filter((e) => e.id !== 's1-08'),
        { id: 's1-99', debut: '0:10', poste: 'feux', actifMin: 1, texte: 'Nouvelle étape' },
      ],
    };
    const s = appliquerPersonnalisation(nouvelleSession, p);
    const liste = ids(s);
    expect(liste).not.toContain('s1-08');
    expect(liste.indexOf('s1-99')).toBe(liste.indexOf('s1-04') + 1);
    expect(liste[liste.indexOf('s1-13') + 1]).toBe('s1-09');
    expect(chronologique(s)).toBe(true);
  });

  it('exporte un plan valide qui contient l’ordre et les heures modifiés', () => {
    const p = deplacerEtape(origine, origine, 's1-13', 9)!;
    const exporte = planAvecPersonnalisations(plan, new Map([[1, p]]));
    const r = validerPlan(JSON.parse(JSON.stringify(exporte)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const etapes = r.plan.semaines[0]!.session!.etapes;
      expect(etapes[8]!.id).toBe('s1-13');
      expect(etapes[8]!.debut).toBe('0:57');
    }
    // Le plan d'origine n'est pas modifié.
    expect(origine.etapes.find((e) => e.id === 's1-13')!.debut).toBe('1:13');
  });
});

describe('heure d’horloge en mode cuisine', () => {
  it('ajoute le décalage à l’heure de début', () => {
    expect(heureHorloge('14:30', '0:05')).toBe('14:35');
    expect(heureHorloge('14:30', '2:10')).toBe('16:40');
    expect(heureHorloge('23:50', '0:20')).toBe('00:10');
    expect(heureHorloge('09:05', '0:00')).toBe('09:05');
  });
});
