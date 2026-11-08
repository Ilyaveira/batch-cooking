// Géométrie du planning (Gantt) : positions des barres, graduations et lignes, à partir des
// couloirs calculés par planning() (src/domain/session.ts). Aucune donnée n'est ajoutée : tout
// vient des étapes (heure, minutes actives, cuisson passive, rappels, alertes).
import { formaterHeureSession } from './dates';
import type { Couloir, TypeSegment } from './session';

export type OptionsGantt = {
  /** Largeur totale disponible, en px. */
  largeur: number;
  /** Largeur réservée aux libellés des tâches, en px. */
  largeurLibelles: number;
  hauteurLigne?: number;
  hauteurEntete?: number;
};

export type BarreGantt = { type: TypeSegment; x: number; largeur: number; etape: string; debut: number; fin: number };
export type LigneGantt = { id: string; libelle: string; y: number; barres: BarreGantt[] };
export type Graduation = { minute: number; x: number; libelle: string };

export type GeometrieGantt = {
  largeur: number;
  hauteur: number;
  x0: number;
  /** px par minute. */
  echelle: number;
  finMin: number;
  graduations: Graduation[];
  lignes: LigneGantt[];
  hauteurLigne: number;
  hauteurEntete: number;
};

/** Largeur minimale d'une barre, pour qu'une alerte d'une minute reste visible et touchable. */
export const LARGEUR_MIN_BARRE = 3;

export function geometrieGantt(planning: { couloirs: Couloir[]; finMin: number }, o: OptionsGantt): GeometrieGantt {
  const hauteurLigne = o.hauteurLigne ?? 28;
  const hauteurEntete = o.hauteurEntete ?? 24;
  const marge = 8;
  // Axe arrondi au quart d'heure supérieur (au moins 15 min).
  const finMin = Math.max(15, Math.ceil(planning.finMin / 15) * 15);
  const x0 = o.largeurLibelles;
  const utile = Math.max(1, o.largeur - x0 - marge);
  const echelle = utile / finMin;
  // Graduations tous les quarts d'heure si la place le permet, sinon toutes les demi-heures.
  const pas = echelle * 15 >= 34 ? 15 : echelle * 30 >= 34 ? 30 : 60;
  const graduations: Graduation[] = [];
  for (let m = 0; m <= finMin; m += pas) graduations.push({ minute: m, x: x0 + m * echelle, libelle: formaterHeureSession(m) });

  const lignes: LigneGantt[] = planning.couloirs.map((c, i) => ({
    id: c.id,
    libelle: c.libelle,
    y: hauteurEntete + i * hauteurLigne,
    // Les alertes sont dessinées après les autres segments pour rester visibles par-dessus.
    barres: [...c.segments]
      .sort((a, b) => (a.type === 'alerte' ? 1 : 0) - (b.type === 'alerte' ? 1 : 0))
      .map((s) => ({
        type: s.type,
        x: x0 + s.debut * echelle,
        largeur: Math.max(LARGEUR_MIN_BARRE, (s.fin - s.debut) * echelle),
        etape: s.etape,
        debut: s.debut,
        fin: s.fin,
      })),
  }));

  return {
    largeur: o.largeur,
    hauteur: hauteurEntete + lignes.length * hauteurLigne + 4,
    x0,
    echelle,
    finMin,
    graduations,
    lignes,
    hauteurLigne,
    hauteurEntete,
  };
}

/** Libellé raccourci pour tenir dans `largeurPx` (≈ 7 px par caractère à 12 px). */
export function raccourcir(texte: string, largeurPx: number, pxParCaractere = 7): string {
  const max = Math.max(4, Math.floor(largeurPx / pxParCaractere));
  return texte.length <= max ? texte : `${texte.slice(0, max - 1)}…`;
}
