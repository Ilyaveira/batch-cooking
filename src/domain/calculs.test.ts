import { describe, expect, it } from 'vitest';
import { calendrierSemaine, conservationRecette, statutConservation } from './calendrier';
import { coursesSemaine, placardMois, texteQuantite } from './courses';
import { ajouterJours, dateLongue, formaterHeureSession, joursEntre, jourSemaine, minutesDepuisDebut } from './dates';
import { alertesExclusions, contientExclusion } from './exclusions';
import { facteurPortions, ingredientsPourPortions } from './portions';
import { CONSERVATION_DEFAUT, REGLAGES_DEFAUT, temperatureAffichee } from './reglages';
import { aSortir, etapesTriees, minuteurEtape, morceauxTexte, planning, segmentsEtape } from './session';
import { fixturePlan } from './test-utils';
import { formaterQuantite, formaterQuantiteUnite } from './unites';

const plan = fixturePlan();
const semaine = plan.semaines[0]!;
const recette = (id: string) => plan.recettes.find((r) => r.id === id)!;

describe('portions', () => {
  it('calcule le facteur', () => {
    expect(facteurPortions(6, 4)).toBe(1.5);
    expect(() => facteurPortions(2, 0)).toThrow();
  });
  it('met les quantités à l’échelle sans toucher aux quantités inconnues', () => {
    const lignes = ingredientsPourPortions(recette('sheet-pan-poulet-butternut'), 2);
    expect(lignes.find((l) => l.ingredient === 'blanc-poulet')!.quantite).toBe(250);
    expect(lignes.find((l) => l.ingredient === 'herbes-provence')!.quantite).toBeNull();
  });
});

describe('affichage des quantités', () => {
  it('arrondit sans changer l’unité de calcul', () => {
    expect(formaterQuantite(213.33, 'masse')).toBe('215 g');
    expect(formaterQuantite(1300, 'masse')).toBe('1,3 kg');
    expect(formaterQuantite(42.4, 'masse')).toBe('42 g');
    expect(formaterQuantiteUnite(9, 'cl')).toBe('9 cl');
    expect(formaterQuantiteUnite(1.5, 'l')).toBe('1,5 l');
  });
  it('utilise des fractions pour les unités comptées', () => {
    expect(formaterQuantite(0.5, 'piece')).toBe('½');
    expect(formaterQuantite(1.5, 'piece')).toBe('1 ½');
    expect(formaterQuantite(0.5, 'sachet')).toBe('½ sachet');
    expect(formaterQuantite(2, 'boite')).toBe('2 boîtes');
    expect(formaterQuantite(3, 'cac')).toBe('3 c. à c.');
  });
});

describe('courses de la semaine 1', () => {
  const rayons = coursesSemaine(plan, semaine);
  const ligne = (id: string, famille?: string) =>
    rayons.flatMap((r) => r.lignes).find((l) => l.ingredient.id === id && (!famille || l.famille === famille));

  it('trie par rayon dans l’ordre du magasin', () => {
    expect(rayons.map((r) => r.rayon)).toEqual(['fruits-legumes', 'boucherie-poissonnerie', 'cremerie', 'epicerie', 'surgeles']);
  });

  // Totaux de l'onglet « Courses » du document de novembre.
  it('retrouve les totaux du document source', () => {
    expect(ligne('blanc-poulet')!.quantiteBase).toBe(650);
    expect(ligne('feta')!.quantiteBase).toBe(400);
    expect(ligne('oeuf')!.quantiteBase).toBe(13);
    expect(ligne('cottage-cheese')!.quantiteBase).toBe(160);
    expect(ligne('brocolis')!.quantiteBase).toBe(500);
    expect(ligne('oignon-rouge')!.quantiteBase).toBe(3);
    expect(ligne('oignons-eminces-surgeles')!.quantiteBase).toBe(330);
    expect(ligne('lentilles-vertes')!.quantiteBase).toBeCloseTo(320, 1);
    expect(ligne('lait-coco')!.quantiteBase).toBe(90); // 9 cl en ml
  });

  it('garde séparées des unités de familles différentes (carottes en g et en pièces)', () => {
    expect(ligne('carotte', 'masse')!.quantiteBase).toBe(265);
    expect(ligne('carotte', 'piece')!.quantiteBase).toBe(3);
  });

  it('signale une quantité non précisée au lieu de l’inventer', () => {
    const ciboulette = ligne('ciboulette')!;
    expect(ciboulette.incomplete).toBe(true);
    expect(texteQuantite(ciboulette)).toBe('1 botte + quantité non précisée');
  });

  it('exclut les produits de placard de la liste hebdomadaire', () => {
    expect(ligne('riz-basmati')).toBeUndefined();
    expect(ligne('huile-olive')).toBeUndefined();
  });

  it('met à l’échelle selon les portions du plat', () => {
    const p = structuredClone(plan);
    p.semaines[0]!.plats[0]!.portions = 8; // salade doublée
    const feta = coursesSemaine(p, p.semaines[0]!).flatMap((r) => r.lignes).find((l) => l.ingredient.id === 'feta')!;
    expect(feta.quantiteBase).toBe(550);
  });
});

describe('placard du mois', () => {
  it('reprend les quantités prévues et ajoute ce que les recettes utilisent', () => {
    const lignes = placardMois(plan);
    const riz = lignes.find((l) => l.ingredient.id === 'riz-basmati')!;
    expect(riz.prevu).toBe('1,25 kg');
    expect(riz.utiliseCeMois).toEqual([{ famille: 'masse', quantiteBase: 240, incomplete: false }]);
    expect(riz.semaines).toEqual([1]);
    expect(lignes.find((l) => l.ingredient.id === 'curry')!.utiliseCeMois).toEqual([]);
  });
});

describe('dates', () => {
  it('compte les jours sans être piégé par le changement d’heure', () => {
    expect(joursEntre('2026-10-24', '2026-10-26')).toBe(2);
    expect(ajouterJours('2026-11-29', 4)).toBe('2026-12-03');
    expect(jourSemaine('2026-11-08')).toBe(0);
    expect(dateLongue('2026-11-01')).toBe('dimanche 1er novembre');
  });
  it('convertit les heures de session', () => {
    expect(minutesDepuisDebut('1:05')).toBe(65);
    expect(formaterHeureSession(130)).toBe('2:10');
  });
});

describe('conservation et calendrier', () => {
  it('retient le type le plus contraignant de la recette', () => {
    const c = conservationRecette(recette('mujaddara'), REGLAGES_DEFAUT);
    expect(c.type!.cle).toBe('riz');
  });
  it('signale les clés absentes des réglages', () => {
    const c = conservationRecette({ ...recette('mujaddara'), conservation: ['riz', 'cake-sale'] }, REGLAGES_DEFAUT);
    expect(c.clesInconnues).toEqual(['cake-sale']);
  });
  it('donne le statut selon les bornes', () => {
    const t = CONSERVATION_DEFAUT.find((x) => x.cle === 'plat-cuisine')!;
    expect(statutConservation(3, t)).toBe('ok');
    expect(statutConservation(4, t)).toBe('limite');
    expect(statutConservation(5, t)).toBe('depasse');
    expect(statutConservation(1, null)).toBe('inconnu');
  });
  it('construit la semaine du dimanche au jeudi et repère le mujaddara du jeudi', () => {
    const { jours, horsDelai } = calendrierSemaine(plan, semaine, REGLAGES_DEFAUT);
    expect(jours.map((j) => j.nomJour)).toEqual(['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi']);
    expect(jours[1]!.repas.midi.map((e) => e.recette.id)).toEqual(['salade-lentilles-butternut-feta']);
    // Riz cuit dimanche, mangé jeudi (J+4) : au-delà des 2 jours de la NSW Food Authority.
    expect(horsDelai.map((e) => `${e.recette.id}@J${e.jours}`)).toEqual(['mujaddara@J4']);
    expect(jours[2]!.repas.midi[0]!.statut).toBe('ok'); // mujaddara mardi, J+2
  });
  it('n’invente pas de durée pour un plat sans type de conservation', () => {
    const { jours } = calendrierSemaine(plan, semaine, REGLAGES_DEFAUT);
    const cake = jours[3]!.repas.soir.find((e) => e.recette.id === 'cake-tomates-sechees-feta')!;
    expect(cake.statut).toBe('inconnu');
    expect(cake.portions).toBe(2);
  });
});

describe('session', () => {
  const session = semaine.session!;
  it('trie les étapes par heure', () => {
    const t = etapesTriees({ ...session, etapes: [...session.etapes].reverse() });
    expect(t[0]!.debut).toBe('0:00');
    expect(t.at(-1)!.debut).toBe('2:10');
  });
  it('dérive les segments du Gantt comme le planning du document', () => {
    const lentilles = session.etapes.find((e) => e.id === 's1-03')!;
    expect(segmentsEtape(lentilles)).toEqual([
      { type: 'actif', debut: 5, fin: 8, etape: 's1-03' },
      { type: 'passif', debut: 8, fin: 30, etape: 's1-03' },
    ]);
    const oignons = session.etapes.find((e) => e.id === 's1-10')!;
    expect(segmentsEtape(oignons).filter((s) => s.type === 'alerte').map((s) => s.debut)).toEqual([70, 80, 90]);
    const { couloirs, finMin } = planning(session);
    expect(couloirs).toHaveLength(14);
    expect(finMin).toBe(132);
  });
  it('propose un minuteur pour les cuissons passives', () => {
    expect(minuteurEtape(session.etapes.find((e) => e.id === 's1-03')!)!.dureeMin).toBe(25);
    expect(minuteurEtape(session.etapes.find((e) => e.id === 's1-05')!)).toBeNull();
  });
  it('regroupe « à sortir » par lieu de stockage, placard compris', () => {
    const a = aSortir(plan, semaine);
    expect(a.parStockage.map((g) => g.stockage)).toEqual(['frigo', 'congelateur', 'legumes', 'placard']);
    const placard = a.parStockage.find((g) => g.stockage === 'placard')!.lignes.map((l) => l.ingredient.id);
    expect(placard).toContain('riz-basmati');
    expect(a.ustensiles[0]).toBe('2 plaques et papier cuisson');
    expect(new Set(a.ustensiles.map((u) => u.toLowerCase())).size).toBe(a.ustensiles.length);
  });
  it('met en gras uniquement le texte entre **', () => {
    expect(morceauxTexte('**320 g de lentilles** rincées')).toEqual([
      { texte: '320 g de lentilles', gras: true },
      { texte: ' rincées', gras: false },
    ]);
    expect(morceauxTexte('a **b')).toEqual([{ texte: 'a **b', gras: false }]);
  });
});

describe('réglages', () => {
  it('ajuste la température pour la chaleur tournante', () => {
    expect(temperatureAffichee(210, 'traditionnel', { mode: 'chaleur-tournante', decalageChaleurTournanteC: 20 })).toEqual({
      valeurC: 190,
      ajustee: true,
    });
    expect(temperatureAffichee(210, 'traditionnel', { mode: 'traditionnel', decalageChaleurTournanteC: 20 }).ajustee).toBe(false);
  });
});

describe('exclusions', () => {
  it('reconnaît une exclusion malgré accents et pluriel', () => {
    expect(contientExclusion('Champignons de Paris', 'champignon')).toBe(true);
    expect(contientExclusion('Riz basmati', 'riz complet')).toBe(false);
    expect(contientExclusion('Riz complet', 'Riz complet')).toBe(true);
    expect(contientExclusion('Tomates séchées', 'tomates confites')).toBe(false);
  });
  it('ne vérifie que les personnes qui mangent le plat', () => {
    const personnes = [
      { id: 'personne-a', nom: 'A', exclusions: [] },
      { id: 'personne-b', nom: 'B', exclusions: ['lentilles'] },
    ];
    const alertes = alertesExclusions(plan, personnes);
    // Lentilles : salade (pour tous) → alerte ; mujaddara (pour A seulement) → pas d'alerte pour B.
    expect(alertes.map((a) => a.recette)).toEqual(['Salade de lentilles, butternut et feta']);
  });
});

describe('températures dans le texte des étapes', () => {
  it('annote chaque température pour la chaleur tournante', async () => {
    const { annoterTemperatures } = await import('./reglages');
    const four = { mode: 'chaleur-tournante' as const, decalageChaleurTournanteC: 20 };
    expect(annoterTemperatures('Préchauffe à 210 °C, puis baisse à 180°C.', 'traditionnel', four)).toBe(
      'Préchauffe à 210 °C (190 °C en chaleur tournante), puis baisse à 180°C (160 °C en chaleur tournante).',
    );
    expect(annoterTemperatures('Préchauffe à 210 °C.', 'chaleur-tournante', four)).toBe('Préchauffe à 210 °C.');
  });

  it('n’annote que les étapes du poste Four (pas le Cook Expert)', async () => {
    const { texteEtapeAffiche } = await import('./session');
    const reglages = { mode: 'chaleur-tournante' as const, decalageChaleurTournanteC: 20 };
    const session = semaine.session!;
    const veloute = session.etapes.find((e) => e.id === 's1-20')!;
    const prechauffe = session.etapes.find((e) => e.id === 's1-01')!;
    expect(texteEtapeAffiche(veloute.texte, veloute, session, reglages)).toBe(veloute.texte);
    expect(texteEtapeAffiche(prechauffe.texte, prechauffe, session, reglages)).toBe(
      'Préchauffe à 210 °C (190 °C en chaleur tournante).',
    );
  });
});
