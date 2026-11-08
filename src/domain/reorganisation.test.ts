import { describe, expect, it } from 'vitest';
import { heureHorloge, minutesDepuisDebut } from './dates';
import {
  appliquerPersonnalisation,
  blocs,
  changerHeure,
  deplacerEtape,
  formaterSaisieEtape,
  fusionnerAvecSuivante,
  lireHeureSession,
  lireSaisieEtape,
  modifierTexte,
  planAvecPersonnalisations,
  proposerCoupure,
  scinderEtape,
  separerFusion,
  type Personnalisation,
} from './reorganisation';
import { minuteurEtape, planning } from './session';
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

describe('modifier le texte d’une étape', () => {
  it('saisie libre : la consigne, puis les sous-points en lignes « - »', () => {
    const plaques = origine.etapes.find((e) => e.id === 's1-09')!;
    const saisie = formaterSaisieEtape(plaques);
    expect(saisie.split('\n')).toHaveLength(3);
    expect(lireSaisieEtape(saisie)).toEqual({ texte: plaques.texte, details: plaques.details });
    expect(lireSaisieEtape('Égoutte\nles lentilles.\n• Garde un peu d’eau')).toEqual({
      texte: 'Égoutte les lentilles.',
      details: ['Garde un peu d’eau'],
    });
    expect(() => lireSaisieEtape('- seulement un sous-point')).toThrow(/vide/);
  });

  it('réécrit l’étape sans toucher à son heure ni à son minuteur', () => {
    const p = modifierTexte(origine, origine, 's1-03', '**320 g de lentilles** dans l’eau bouillante salée.')!;
    expect(p.textes).toEqual({ 's1-03': { texte: '**320 g de lentilles** dans l’eau bouillante salée.' } });
    const e = affichee(p).etapes.find((x) => x.id === 's1-03')!;
    expect(e.debut).toBe('0:05');
    expect(minuteurEtape(e)!.dureeMin).toBe(25);
  });

  it('revenir au texte d’origine annule la modification', () => {
    const p = modifierTexte(origine, origine, 's1-03', 'Autre texte')!;
    const texte = origine.etapes.find((e) => e.id === 's1-03')!.texte;
    expect(modifierTexte(affichee(p), origine, 's1-03', texte)).toBeNull();
  });
});

describe('scinder une étape', () => {
  const marinade = origine.etapes.find((e) => e.id === 's1-14')!;

  it('propose une coupure après la 1ʳᵉ phrase', () => {
    expect(proposerCoupure(marinade)[0]).toBe('Écale les œufs.');
    expect(proposerCoupure(marinade)[1]).toMatch(/^Marinade : /);
  });

  it('2ᵉ partie : même heure, juste après, sans minuteur ; la 1ʳᵉ garde tout', () => {
    const [a, b] = proposerCoupure(marinade);
    const p = scinderEtape(origine, origine, 's1-14', a, b)!;
    const s = affichee(p);
    const liste = ids(s);
    expect(liste[liste.indexOf('s1-14') + 1]).toBe('s1-14-b');
    const partie2 = s.etapes.find((e) => e.id === 's1-14-b')!;
    expect(partie2.debut).toBe('1:15');
    expect(partie2.actifMin).toBe(0);
    expect(minuteurEtape(partie2)).toBeNull();
    expect(partie2.alerte).toBeUndefined();
    expect(s.etapes.find((e) => e.id === 's1-14')!.texte).toBe('Écale les œufs.');
    expect(s.etapes.find((e) => e.id === 's1-14')!.actifMin).toBe(10);
    expect(s.etapes).toHaveLength(24);
  });

  it('la 2ᵉ partie se déplace et se rescinde comme une étape normale', () => {
    const [a, b] = proposerCoupure(marinade);
    let p = scinderEtape(origine, origine, 's1-14', a, b)!;
    p = changerHeure(affichee(p), origine, 's1-14-b', '1:20')!;
    expect(affichee(p).etapes.find((e) => e.id === 's1-14-b')!.debut).toBe('1:20');
    p = scinderEtape(affichee(p), origine, 's1-14-b', 'Marinade.', 'Les 4 œufs dedans.')!;
    expect(ids(affichee(p))).toContain('s1-14-c');
    expect(chronologique(affichee(p))).toBe(true);
  });

  it('refuse une 2ᵉ partie vide', () => {
    expect(() => scinderEtape(origine, origine, 's1-14', 'Tout', '  ')).toThrow(/vide/);
  });
});

describe('fusionner des étapes', () => {
  const fusion = () => fusionnerAvecSuivante(origine, origine, 's1-03')!; // lentilles + riz

  it('une seule carte à l’heure de la 1ʳᵉ, les deux minuteurs gardés', () => {
    const s = affichee(fusion());
    const b = blocs(s);
    expect(b).toHaveLength(22);
    const bloc = b.find((x) => x.id === 's1-03')!;
    expect(bloc.membres.map((m) => m.id)).toEqual(['s1-03', 's1-04']);
    expect(bloc.debut).toBe('0:05');
    expect(bloc.membres.map((m) => minuteurEtape(m)!.dureeMin)).toEqual([25, 12]);
    expect(chronologique(s)).toBe(true);
    // Les données restent : 23 étapes, le planning a toujours ses deux cuissons passives.
    expect(s.etapes).toHaveLength(23);
    expect(planning(s).couloirs.find((c) => c.id === 'riz')!.segments.some((x) => x.type === 'passif')).toBe(true);
  });

  it('la fusion se déplace en bloc et se défait', () => {
    let p = fusion();
    p = deplacerEtape(affichee(p), origine, 's1-03', 5)!;
    const s = affichee(p);
    const bloc = blocs(s)[4]!;
    expect(bloc.membres.map((m) => [m.id, m.debut])).toEqual([
      ['s1-03', '0:20'],
      ['s1-04', '0:20'],
    ]);
    const separe = affichee(separerFusion(s, origine, 's1-04'));
    expect(blocs(separe)).toHaveLength(23);
    expect(separe.etapes.every((e) => !e.groupe)).toBe(true);
  });

  it('refuse de fusionner la dernière étape', () => {
    expect(() => fusionnerAvecSuivante(origine, origine, 's1-23')).toThrow(/dernière/);
  });

  it('fusionner trois étapes de suite garde un seul groupe', () => {
    let p = fusion();
    p = fusionnerAvecSuivante(affichee(p), origine, 's1-04')!;
    expect(blocs(affichee(p)).find((x) => x.id === 's1-03')!.membres).toHaveLength(3);
  });
});

describe('réimport et export avec textes, scissions et fusions', () => {
  it('une étape non touchée reprend le texte du nouveau plan ; une partie dont la source disparaît est ignorée', () => {
    const [a, b] = proposerCoupure(origine.etapes.find((e) => e.id === 's1-14')!);
    let p = scinderEtape(origine, origine, 's1-14', a, b)!;
    p = modifierTexte(affichee(p), origine, 's1-03', 'Lentilles, texte perso.')!;
    const nouveauPlan: typeof origine = {
      ...origine,
      etapes: origine.etapes
        .filter((e) => e.id !== 's1-14')
        .map((e) => (e.id === 's1-04' ? { ...e, texte: 'Riz : texte corrigé par Claude.' } : e)),
    };
    const s = appliquerPersonnalisation(nouveauPlan, p);
    expect(s.etapes.find((e) => e.id === 's1-04')!.texte).toBe('Riz : texte corrigé par Claude.');
    expect(s.etapes.find((e) => e.id === 's1-03')!.texte).toBe('Lentilles, texte perso.');
    expect(ids(s)).not.toContain('s1-14-b');
  });

  it('lit une personnalisation enregistrée avant ces fonctionnalités (ordre + heures seulement)', () => {
    const ancienne = { ordre: ['s1-02', 's1-01'], heures: { 's1-01': '0:00' } };
    expect(ids(appliquerPersonnalisation(origine, ancienne)).slice(0, 2)).toEqual(['s1-02', 's1-01']);
  });

  it('exporte un plan valide : parties scindées, textes et fusions (champ « groupe »)', () => {
    const [a, b] = proposerCoupure(origine.etapes.find((e) => e.id === 's1-14')!);
    let p = scinderEtape(origine, origine, 's1-14', a, b)!;
    p = fusionnerAvecSuivante(affichee(p), origine, 's1-03')!;
    const r = validerPlan(JSON.parse(JSON.stringify(planAvecPersonnalisations(plan, new Map([[1, p]])))));
    expect(r.ok ? [] : r.erreurs).toEqual([]);
    if (r.ok) {
      const etapes = r.plan.semaines[0]!.session!.etapes;
      expect(etapes.find((e) => e.id === 's1-14-b')!.texte).toMatch(/^Marinade/);
      expect(etapes.filter((e) => e.groupe === 's1-03').map((e) => e.id)).toEqual(['s1-03', 's1-04']);
      expect(etapes.some((e) => 'source' in e)).toBe(false);
      // Réimporté tel quel, le plan affiche la même fusion.
      expect(blocs(r.plan.semaines[0]!.session!)).toHaveLength(23);
    }
  });
});
