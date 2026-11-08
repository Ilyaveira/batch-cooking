// Session du dimanche : « à sortir », étapes triées, planning (Gantt) et minuteurs,
// tous dérivés des mêmes étapes pour rester cohérents entre eux.
import { STOCKAGES, STOCKAGE_PAR_RAYON, type Poste, type Stockage } from './constantes';
import { besoinsSemaine, type LigneCalculee } from './courses';
import { minutesDepuisDebut } from './dates';
import type { EtapeSession, Ingredient, Plan, Semaine, Session } from './schema/plan';
import { annoterTemperatures, type Reglages } from './reglages';

export function stockageDe(i: Ingredient): Stockage {
  return i.stockage ?? STOCKAGE_PAR_RAYON[i.rayon];
}

export type ASortir = {
  parStockage: { stockage: Stockage; lignes: LigneCalculee[] }[];
  ustensiles: string[];
};

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

export function aSortir(plan: Plan, semaine: Semaine): ASortir {
  const besoins = besoinsSemaine(plan, semaine);
  const parStockage = STOCKAGES.map((stockage) => ({
    stockage,
    lignes: besoins
      .filter((l) => stockageDe(l.ingredient) === stockage)
      .sort((a, b) => collator.compare(a.ingredient.nom, b.ingredient.nom)),
  })).filter((g) => g.lignes.length > 0);

  // Ustensiles : ceux de la session, puis ceux des recettes non encore cités (sans doublon).
  const vus = new Set<string>();
  const ustensiles: string[] = [];
  const ajouter = (u: string) => {
    const k = u.trim().toLocaleLowerCase('fr');
    if (!vus.has(k)) {
      vus.add(k);
      ustensiles.push(u.trim());
    }
  };
  semaine.session?.ustensiles?.forEach(ajouter);
  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  semaine.plats.forEach((p) => recettes.get(p.recette)?.ustensiles?.forEach(ajouter));
  return { parStockage, ustensiles };
}

/** Étapes triées par heure de début (tri stable : l'ordre du plan départage les égalités). */
export function etapesTriees(session: Session): EtapeSession[] {
  return session.etapes
    .map((e, i) => ({ e, i }))
    .sort((a, b) => minutesDepuisDebut(a.e.debut) - minutesDepuisDebut(b.e.debut) || a.i - b.i)
    .map((x) => x.e);
}

export type TypeSegment = 'actif' | 'passif' | 'alerte';
export type Segment = { type: TypeSegment; debut: number; fin: number; etape: string };
export type Couloir = { id: string; libelle: string; poste: Poste; segments: Segment[] };

/** Segments d'une étape : actif (ou alerte), puis passif, plus un repère par rappel. */
export function segmentsEtape(e: EtapeSession): Segment[] {
  const d = minutesDepuisDebut(e.debut);
  const actif = e.alerte ? Math.max(1, e.actifMin) : e.actifMin;
  const segs: Segment[] = [];
  if (actif > 0) segs.push({ type: e.alerte ? 'alerte' : 'actif', debut: d, fin: d + actif, etape: e.id });
  if (e.passifMin && e.passifMin > 0)
    segs.push({ type: 'passif', debut: d + actif, fin: d + actif + e.passifMin, etape: e.id });
  for (const r of e.rappelsMin ?? []) segs.push({ type: 'alerte', debut: d + r, fin: d + r + 1, etape: e.id });
  return segs;
}

/** Couloirs du planning : un par tâche déclarée, sinon un par étape. */
export function planning(session: Session): { couloirs: Couloir[]; finMin: number } {
  const libelles = new Map((session.taches ?? []).map((t) => [t.id, t.libelle]));
  const couloirs = new Map<string, Couloir>();
  for (const e of etapesTriees(session)) {
    const id = e.tache ?? `etape:${e.id}`;
    let c = couloirs.get(id);
    if (!c) {
      const libelle = e.tache ? (libelles.get(e.tache) ?? e.tache) : e.texte.replace(/\*\*/g, '');
      c = { id, libelle, poste: e.poste, segments: [] };
      couloirs.set(id, c);
    }
    c.segments.push(...segmentsEtape(e));
  }
  const liste = [...couloirs.values()];
  const finMin = Math.max(0, ...liste.flatMap((c) => c.segments.map((s) => s.fin)));
  return { couloirs: liste, finMin };
}

export type Minuteur = { etape: string; libelle: string; dureeMin: number; rappelsMin: number[] };

/** Minuteur proposé pour une étape avec cuisson passive ou rappels. */
export function minuteurEtape(e: EtapeSession): Minuteur | null {
  const duree = (e.passifMin ?? 0) + (e.passifMin ? e.actifMin : 0);
  const rappels = e.rappelsMin ?? [];
  if (duree <= 0 && rappels.length === 0) return null;
  return {
    etape: e.id,
    libelle: e.texte.replace(/\*\*/g, ''),
    dureeMin: duree > 0 ? duree : Math.max(...rappels),
    rappelsMin: rappels,
  };
}

export type Morceau = { texte: string; gras: boolean };

/** « **320 g de lentilles** rincées » → morceaux gras / normaux (seul le gras est interprété). */
export function morceauxTexte(texte: string): Morceau[] {
  const parts = texte.split('**');
  // Nombre impair de « ** » : le dernier n'est pas fermé, on le garde tel quel.
  if (parts.length % 2 === 0) {
    const fin = parts.pop()!;
    parts[parts.length - 1] += `**${fin}`;
  }
  return parts.map((p, i) => ({ texte: p, gras: i % 2 === 1 })).filter((m) => m.texte !== '');
}

/**
 * Texte (ou sous-point) d'étape tel qu'affiché : températures du four annotées selon le four
 * de l'utilisatrice. Seul le poste Four est concerné (le Cook Expert a ses propres températures).
 */
export function texteEtapeAffiche(texte: string, e: EtapeSession, session: Session, four: Reglages['four']): string {
  if (e.poste !== 'four') return texte;
  return annoterTemperatures(texte, session.modeFour ?? 'traditionnel', four);
}
