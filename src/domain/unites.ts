// Unités : familles convertibles (masse, volume) et unités comptées (jamais converties).
import type { Unite } from './constantes';

/** 'masse' (base g), 'volume' (base ml), ou l'unité comptée elle-même. */
export type Famille = 'masse' | 'volume' | Exclude<Unite, 'g' | 'kg' | 'ml' | 'cl' | 'l'>;

const FACTEUR_BASE: Partial<Record<Unite, number>> = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };

export function familleDe(u: Unite): Famille {
  if (u === 'g' || u === 'kg') return 'masse';
  if (u === 'ml' || u === 'cl' || u === 'l') return 'volume';
  return u;
}

/** Convertit vers l'unité de base de la famille (g, ml, ou l'unité comptée). */
export function versBase(quantite: number, u: Unite): number {
  return quantite * (FACTEUR_BASE[u] ?? 1);
}

const nf = (max: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max });

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 1.5 → « 1 ½ », 0.25 → « ¼ » */
function avecFractions(x: number): string {
  const entier = Math.floor(x);
  const reste = Math.round((x - entier) * 100) / 100;
  const frac = FRACTIONS[String(reste)];
  if (!frac) return nf(2).format(x);
  return entier === 0 ? frac : `${entier} ${frac}`;
}

const arrondi = (x: number, pas: number) => Math.round(x / pas) * pas;

const NOMS_UNITE: Record<string, [string, string]> = {
  botte: ['botte', 'bottes'],
  gousse: ['gousse', 'gousses'],
  tranche: ['tranche', 'tranches'],
  sachet: ['sachet', 'sachets'],
  boite: ['boîte', 'boîtes'],
  pot: ['pot', 'pots'],
  cas: ['c. à s.', 'c. à s.'],
  cac: ['c. à c.', 'c. à c.'],
  pincee: ['pincée', 'pincées'],
};

/**
 * Texte affiché pour une quantité exprimée dans l'unité de base de sa famille.
 * L'arrondi ne sert qu'à l'affichage ; les calculs gardent la valeur exacte.
 */
export function formaterQuantite(quantiteBase: number, famille: Famille): string {
  const q = quantiteBase;
  switch (famille) {
    case 'masse':
      if (q >= 1000) return `${nf(2).format(arrondi(q / 1000, 0.01))} kg`;
      if (q >= 100) return `${nf(0).format(arrondi(q, 5))} g`;
      if (q >= 10) return `${nf(0).format(Math.round(q))} g`;
      return `${nf(1).format(arrondi(q, 0.5))} g`;
    case 'volume':
      if (q >= 1000) return `${nf(2).format(arrondi(q / 1000, 0.01))} l`;
      if (q >= 10) return `${nf(1).format(arrondi(q / 10, 0.5))} cl`;
      return `${nf(1).format(arrondi(q, 0.5))} ml`;
    case 'piece':
      return avecFractions(Math.max(0.25, arrondi(q, 0.25)));
    case 'cas':
    case 'cac': {
      const v = Math.max(0.25, arrondi(q, 0.25));
      return `${avecFractions(v)} ${NOMS_UNITE[famille]![v > 1 ? 1 : 0]}`;
    }
    case 'pincee': {
      const v = Math.max(1, Math.round(q));
      return `${v} ${NOMS_UNITE.pincee![v > 1 ? 1 : 0]}`;
    }
    default: {
      const v = Math.max(0.25, arrondi(q, 0.25));
      const noms = NOMS_UNITE[famille] ?? [famille, famille];
      return `${avecFractions(v)} ${noms[v > 1 ? 1 : 0]}`;
    }
  }
}

/** Raccourci : quantité + unité telles qu'écrites dans le plan. */
export function formaterQuantiteUnite(quantite: number, u: Unite): string {
  return formaterQuantite(versBase(quantite, u), familleDe(u));
}
