// Nutrition calculée à partir de la table Ciqual 2025 (ANSES). Rien n'est estimé :
// - un ingrédient sans code Ciqual, sans quantité ou sans masse connue est signalé et n'est pas compté ;
// - une teneur « < x », « traces » ou absente de la table est gardée comme un intervalle
//   (au moins / au plus) au lieu d'être remplacée par un chiffre.
// Toutes les valeurs sont donc des intervalles [min, max] ; max = null veut dire « inconnu ».
import { familleDe, versBase } from './unites';
import { normaliser } from './exclusions';
import type { SourceRef } from './reglages';
import type { Ingredient, LigneIngredient, Plan, Recette, Semaine } from './schema/plan';

/**
 * Constituants Ciqual retenus (codes de const.xml, Ciqual 2025). Protéines : « N x 6,25 »,
 * la définition du règlement (UE) 1169/2011 (annexe I), comme l'énergie retenue (code 328).
 */
export const CONSTITUANTS_CIQUAL = {
  kcal: '328',
  proteines: '25003',
  glucides: '31000',
  sucres: '32000',
  lipides: '40000',
  ags: '40302',
  fibres: '34100',
  sel: '10004',
} as const;

export type Nutriment = keyof typeof CONSTITUANTS_CIQUAL;
export const NUTRIMENTS = Object.keys(CONSTITUANTS_CIQUAL) as Nutriment[];

export const LIBELLES_NUTRIMENT: Record<Nutriment, { libelle: string; unite: 'kcal' | 'g' }> = {
  kcal: { libelle: 'Énergie', unite: 'kcal' },
  proteines: { libelle: 'Protéines', unite: 'g' },
  glucides: { libelle: 'Glucides', unite: 'g' },
  sucres: { libelle: 'dont sucres', unite: 'g' },
  lipides: { libelle: 'Lipides', unite: 'g' },
  ags: { libelle: 'dont acides gras saturés', unite: 'g' },
  fibres: { libelle: 'Fibres', unite: 'g' },
  sel: { libelle: 'Sel', unite: 'g' },
};

/** Teneur pour 100 g telle que dans Ciqual : nombre, « tr » (traces), « <x », ou null (absente). */
export type ValeurCiqual = number | string | null;

/** Lit une teneur de compo.xml (« 12,5 », « < 0,5 », « traces », « - »). undefined = format inconnu. */
export function lireValeurCiqual(teneur: string): ValeurCiqual | undefined {
  const t = teneur.trim();
  if (t === '-' || t === '') return null;
  if (t === 'traces') return 'tr';
  const inf = /^<\s*(\d+(?:,\d+)?)$/.exec(t);
  if (inf) return `<${inf[1]!.replace(',', '.')}`;
  if (/^\d+(?:,\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return undefined;
}

export type Intervalle = { min: number; max: number | null };
export type Precision = 'inferieure' | 'traces' | 'absente';

export function intervalleDe(v: ValeurCiqual): { intervalle: Intervalle; precision?: Precision } {
  if (typeof v === 'number') return { intervalle: { min: v, max: v } };
  if (v === 'tr') return { intervalle: { min: 0, max: null }, precision: 'traces' };
  if (typeof v === 'string' && v.startsWith('<')) return { intervalle: { min: 0, max: Number(v.slice(1)) }, precision: 'inferieure' };
  return { intervalle: { min: 0, max: null }, precision: 'absente' };
}

const ZERO: Intervalle = { min: 0, max: 0 };
const ajouter = (a: Intervalle, b: Intervalle): Intervalle => ({
  min: a.min + b.min,
  max: a.max === null || b.max === null ? null : a.max + b.max,
});
const multiplier = (a: Intervalle, k: number): Intervalle => ({ min: a.min * k, max: a.max === null ? null : a.max * k });

// --- Table ---------------------------------------------------------------------------------

export type AlimentCiqual = { code: string; nom: string; sousGroupe: string; valeurs: Record<Nutriment, ValeurCiqual> };
export type SourceCiqual = { libelle: string; version: string; publication: string; doi: string; url: string; licence: string; licenceUrl: string; note: string };
export type TableCiqual = { source: SourceCiqual; sousGroupes: Record<string, string>; aliments: Map<string, AlimentCiqual> };

/** Fichier public/data/ciqual-2025.json (produit par scripts/construire-ciqual.ts). */
export type FichierCiqual = { source: SourceCiqual; colonnes: string[]; sousGroupes: Record<string, string>; aliments: ValeurCiqual[][] };

export function lireTableCiqual(f: FichierCiqual): TableCiqual {
  const index = (c: string) => f.colonnes.indexOf(c);
  const aliments = new Map<string, AlimentCiqual>();
  for (const ligne of f.aliments) {
    const valeurs = Object.fromEntries(NUTRIMENTS.map((n) => [n, ligne[index(n)] ?? null])) as Record<Nutriment, ValeurCiqual>;
    const code = String(ligne[index('code')]);
    aliments.set(code, { code, nom: String(ligne[index('nom')]), sousGroupe: String(ligne[index('sousGroupe')]), valeurs });
  }
  return { source: f.source, sousGroupes: f.sousGroupes, aliments };
}

/** Recherche par mots (sans accents, singulier) ; les noms qui commencent par le 1er mot d'abord. */
export function chercherAliments(table: TableCiqual, texte: string, max = 15): AlimentCiqual[] {
  const mots = normaliser(texte);
  if (mots.length === 0) return [];
  const trouves: { a: AlimentCiqual; rang: number }[] = [];
  for (const a of table.aliments.values()) {
    const nom = normaliser(a.nom);
    if (!mots.every((m) => nom.some((n) => n.startsWith(m)))) continue;
    trouves.push({ a, rang: (nom[0]?.startsWith(mots[0]!) ? 0 : 1) * 1000 + a.nom.length });
  }
  return trouves.sort((x, y) => x.rang - y.rang).slice(0, max).map((t) => t.a);
}

// --- Calcul pour une liste d'ingrédients ------------------------------------------------------

export type RaisonManque = 'sans-code' | 'code-inconnu' | 'quantite' | 'masse';
export type Manque = { ingredient: string; nom: string; raison: RaisonManque; unite?: string };
export type Approximation = { ingredient: string; nom: string; nutriment: Nutriment; precision: Precision; valeur: ValeurCiqual };

export type Bilan = {
  valeurs: Record<Nutriment, Intervalle>;
  /** Masse des ingrédients comptés, telle que pesée dans la recette (souvent crue). */
  masseG: number;
  /** true si toutes les lignes (non facultatives) ont pu être comptées. */
  complet: boolean;
  manques: Manque[];
  approximations: Approximation[];
  facultatifsIgnores: string[];
};

export const LIBELLES_MANQUE: Record<RaisonManque, string> = {
  'sans-code': 'pas de code Ciqual',
  'code-inconnu': 'code Ciqual absent de la table 2025',
  quantite: 'quantité non précisée',
  masse: 'masse de l’unité inconnue',
};

export function bilanVide(): Bilan {
  return {
    valeurs: Object.fromEntries(NUTRIMENTS.map((n) => [n, ZERO])) as Record<Nutriment, Intervalle>,
    masseG: 0,
    complet: true,
    manques: [],
    approximations: [],
    facultatifsIgnores: [],
  };
}

/**
 * Masse en grammes d'une ligne : directe pour g / kg ; sinon via `masseParUnite` de l'ingrédient
 * (même unité, ou pour un volume toute unité de volume fournie). null si inconnue.
 */
export function masseLigne(quantite: number, unite: LigneIngredient['unite'], ing: Ingredient): number | null {
  if (familleDe(unite) === 'masse') return versBase(quantite, unite);
  const mpu = ing.masseParUnite;
  if (!mpu) return null;
  const directe = mpu[unite];
  if (directe !== undefined) return quantite * directe;
  if (familleDe(unite) === 'volume') {
    for (const u of ['ml', 'cl', 'l'] as const) {
      const m = mpu[u];
      if (m !== undefined) return (versBase(quantite, unite) / versBase(1, u)) * m;
    }
  }
  return null;
}

/** Bilan nutritionnel d'une liste de lignes (quantités telles quelles). */
export function bilanLignes(lignes: LigneIngredient[], catalogue: Map<string, Ingredient>, table: TableCiqual): Bilan {
  const b = bilanVide();
  const inconnu = () => {
    b.complet = false;
    for (const n of NUTRIMENTS) b.valeurs[n] = { min: b.valeurs[n].min, max: null };
  };
  for (const l of lignes) {
    const ing = catalogue.get(l.ingredient);
    const nom = ing?.nom ?? l.ingredient;
    if (l.facultatif) {
      b.facultatifsIgnores.push(nom);
      continue;
    }
    const code = ing?.ciqual?.code;
    const aliment = code ? table.aliments.get(code) : undefined;
    const raison: RaisonManque | null = !code
      ? 'sans-code'
      : !aliment
        ? 'code-inconnu'
        : l.quantite === null
          ? 'quantite'
          : ing && masseLigne(l.quantite, l.unite, ing) === null
            ? 'masse'
            : null;
    if (raison || !ing || !aliment || l.quantite === null) {
      b.manques.push({ ingredient: l.ingredient, nom, raison: raison ?? 'sans-code', ...(raison === 'masse' ? { unite: l.unite } : {}) });
      inconnu();
      continue;
    }
    const masse = masseLigne(l.quantite, l.unite, ing)!;
    b.masseG += masse;
    for (const n of NUTRIMENTS) {
      const v = aliment.valeurs[n];
      const { intervalle, precision } = intervalleDe(v);
      if (precision) b.approximations.push({ ingredient: l.ingredient, nom, nutriment: n, precision, valeur: v });
      b.valeurs[n] = ajouter(b.valeurs[n], multiplier(intervalle, masse / 100));
    }
  }
  return b;
}

export function additionnerBilans(bilans: Bilan[]): Bilan {
  const r = bilanVide();
  for (const b of bilans) {
    for (const n of NUTRIMENTS) r.valeurs[n] = ajouter(r.valeurs[n], b.valeurs[n]);
    r.masseG += b.masseG;
    r.complet &&= b.complet;
    r.manques.push(...b.manques);
    r.approximations.push(...b.approximations);
    r.facultatifsIgnores.push(...b.facultatifsIgnores);
  }
  return r;
}

export function multiplierBilan(b: Bilan, k: number): Bilan {
  return {
    ...b,
    valeurs: Object.fromEntries(NUTRIMENTS.map((n) => [n, multiplier(b.valeurs[n], k)])) as Record<Nutriment, Intervalle>,
    masseG: b.masseG * k,
  };
}

// --- Portions par personne ---------------------------------------------------------------------

/** Une personne qui mange le plat. `coefFeculents` : sa part de féculents, 1 = part de référence. */
export type Mangeur = { id: string; coefFeculents: number };

export type NutritionRecette = {
  /** La recette entière (toutes portions), pour les étiquettes. */
  total: Bilan;
  /** Une portion moyenne (recette ÷ portions). */
  portion: Bilan;
  /** Portion de chaque mangeur : même part de tout, féculents répartis selon les coefficients. */
  parPersonne: Map<string, Bilan>;
  /** Lignes comptées comme féculents (ingrédients marqués « féculent »). */
  feculents: string[];
};

/**
 * Portion par personne. Chaque mangeur a la même part de tous les ingrédients, sauf les féculents
 * (ingrédients marqués `feculent`) répartis au prorata des coefficients : avec 0,75 et 1, la part
 * de féculents de la première personne vaut 0,75 fois celle de la seconde, et le total du plat est
 * conservé (on suppose que chaque mangeur mange le même nombre de portions du plat).
 */
export function nutritionRecette(
  recette: Recette,
  catalogue: Map<string, Ingredient>,
  table: TableCiqual,
  mangeurs: Mangeur[],
): NutritionRecette {
  const estFeculent = (l: LigneIngredient) => catalogue.get(l.ingredient)?.feculent === true;
  const f = bilanLignes(recette.ingredients.filter(estFeculent), catalogue, table);
  const autres = bilanLignes(recette.ingredients.filter((l) => !estFeculent(l)), catalogue, table);
  const total = additionnerBilans([autres, f]);
  const P = recette.portions;
  const portion = multiplierBilan(total, 1 / P);
  const somme = mangeurs.reduce((s, m) => s + Math.max(0, m.coefFeculents), 0);
  const parPersonne = new Map<string, Bilan>();
  for (const m of mangeurs) {
    const part = somme > 0 ? (Math.max(0, m.coefFeculents) * mangeurs.length) / somme : 1;
    parPersonne.set(m.id, additionnerBilans([multiplierBilan(autres, 1 / P), multiplierBilan(f, part / P)]));
  }
  return {
    total,
    portion,
    parPersonne,
    feculents: [...new Set(recette.ingredients.filter(estFeculent).map((l) => catalogue.get(l.ingredient)!.nom))],
  };
}

// --- Étiquettes nutritionnelles ------------------------------------------------------------------

export const REGLEMENT_ALLEGATIONS: SourceRef = {
  libelle: 'Règlement (CE) 1924/2006, annexe — allégations nutritionnelles (Commission européenne)',
  url: 'https://food.ec.europa.eu/food-safety/labelling-and-nutrition/nutrition-and-health-claims/nutrition-claims_en',
};
/** Coefficients de conversion en énergie (kcal/g) du règlement (UE) 1169/2011, annexe XIV. */
export const KCAL_PAR_G = { proteines: 4, glucides: 4, lipides: 9 } as const;
export const REGLEMENT_INCO: SourceRef = {
  libelle: 'Règlement (UE) 1169/2011, annexe XIV — coefficients de conversion en énergie',
  url: 'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32011R1169',
};

export type StatutEtiquette = 'oui' | 'non' | 'indetermine';
export type CleEtiquette =
  | 'riche-proteines'
  | 'source-proteines'
  | 'riche-fibres'
  | 'source-fibres'
  | 'pauvre-lipides'
  | 'pauvre-ags'
  | 'pauvre-sucres'
  | 'pauvre-sel'
  | 'pauvre-glucides';

export type EtiquetteNutrition = {
  cle: CleEtiquette;
  libelle: string;
  statut: StatutEtiquette;
  regle: string;
  /** null : seuil personnel (pas de définition réglementaire). */
  source: SourceRef | null;
  /** Pourquoi le statut est « indéterminé ». */
  raison?: string;
};

/** Bornes basse / haute d'un rapport a / b (b > 0). */
function rapport(a: Intervalle, b: Intervalle): { bas: number; haut: number } {
  const bas = b.max === null || b.max === 0 ? 0 : a.min / b.max;
  const haut = a.max === null || b.min === 0 ? Infinity : a.max / b.min;
  return { bas, haut };
}
const auMoins = ({ bas, haut }: { bas: number; haut: number }, s: number): StatutEtiquette =>
  bas >= s ? 'oui' : haut < s ? 'non' : 'indetermine';
const auPlus = ({ bas, haut }: { bas: number; haut: number }, s: number): StatutEtiquette =>
  haut <= s ? 'oui' : bas > s ? 'non' : 'indetermine';
const ou = (a: StatutEtiquette, b: StatutEtiquette): StatutEtiquette => (a === 'oui' || b === 'oui' ? 'oui' : a === 'non' && b === 'non' ? 'non' : 'indetermine');
const et = (a: StatutEtiquette, b: StatutEtiquette): StatutEtiquette => (a === 'non' || b === 'non' ? 'non' : a === 'oui' && b === 'oui' ? 'oui' : 'indetermine');

export const SEUIL_GLUCIDES_DEFAUT = 26;

/**
 * Étiquettes calculées sur la recette entière, avec les seuils des allégations nutritionnelles du
 * règlement (CE) 1924/2006 (conditions pour les solides). Ces règles visent les denrées vendues :
 * appliquées à une recette maison, elles sont indicatives. Les seuils « pour 100 g » se rapportent
 * à la masse des ingrédients telle que pesée (souvent crue), la masse après cuisson n'étant pas connue.
 * « Pauvre en glucides » n'a pas de définition réglementaire : seuil personnel en % de l'énergie.
 */
export function etiquettesNutrition(total: Bilan, seuilGlucidesPct: number = SEUIL_GLUCIDES_DEFAUT): EtiquetteNutrition[] {
  const v = total.valeurs;
  const kcal = v.kcal;
  const energie = (n: 'proteines' | 'glucides' | 'lipides' | 'ags', k: number) => rapport(multiplier(v[n], k), kcal);
  const masseConnue = total.complet && total.masseG > 0;
  const pour100g = (n: Nutriment) =>
    masseConnue ? rapport(multiplier(v[n], 100), { min: total.masseG, max: total.masseG }) : { bas: 0, haut: Infinity };
  const fibres100kcal = rapport(multiplier(v.fibres, 100), kcal);
  const raison = !total.complet
    ? 'données incomplètes (ingrédients non comptés)'
    : 'teneur incertaine dans Ciqual (« < x », traces ou valeur absente)';
  const e = (cle: CleEtiquette, libelle: string, statut: StatutEtiquette, regle: string, source: SourceRef | null = REGLEMENT_ALLEGATIONS): EtiquetteNutrition => ({
    cle,
    libelle,
    statut,
    regle,
    source,
    ...(statut === 'indetermine' ? { raison } : {}),
  });
  return [
    e('riche-proteines', 'Riche en protéines', auMoins(energie('proteines', KCAL_PAR_G.proteines), 0.2), 'au moins 20 % de l’énergie apportée par les protéines'),
    e('source-proteines', 'Source de protéines', auMoins(energie('proteines', KCAL_PAR_G.proteines), 0.12), 'au moins 12 % de l’énergie apportée par les protéines'),
    e('riche-fibres', 'Riche en fibres', ou(auMoins(pour100g('fibres'), 6), auMoins(fibres100kcal, 3)), 'au moins 6 g de fibres pour 100 g ou 3 g pour 100 kcal'),
    e('source-fibres', 'Source de fibres', ou(auMoins(pour100g('fibres'), 3), auMoins(fibres100kcal, 1.5)), 'au moins 3 g de fibres pour 100 g ou 1,5 g pour 100 kcal'),
    e('pauvre-lipides', 'Pauvre en matières grasses', auPlus(pour100g('lipides'), 3), 'au plus 3 g de lipides pour 100 g'),
    e(
      'pauvre-ags',
      'Pauvre en graisses saturées',
      et(auPlus(pour100g('ags'), 1.5), auPlus(energie('ags', KCAL_PAR_G.lipides), 0.1)),
      'au plus 1,5 g d’acides gras saturés (+ trans) pour 100 g et 10 % de l’énergie ; acides gras trans absents de Ciqual, non comptés',
    ),
    e('pauvre-sucres', 'Pauvre en sucres', auPlus(pour100g('sucres'), 5), 'au plus 5 g de sucres pour 100 g'),
    e('pauvre-sel', 'Pauvre en sel', auPlus(pour100g('sel'), 0.3), 'au plus 0,12 g de sodium pour 100 g, soit 0,3 g de sel (sel = sodium × 2,5)'),
    e(
      'pauvre-glucides',
      'Pauvre en glucides',
      auPlus(energie('glucides', KCAL_PAR_G.glucides), seuilGlucidesPct / 100),
      `au plus ${seuilGlucidesPct} % de l’énergie apportée par les glucides (seuil personnel, réglable)`,
      null,
    ),
  ];
}

/** Étiquettes obtenues, sans « source de » quand « riche en » est obtenu. */
export function etiquettesObtenues(liste: EtiquetteNutrition[]): EtiquetteNutrition[] {
  const oui = new Set(liste.filter((e) => e.statut === 'oui').map((e) => e.cle));
  return liste.filter(
    (e) =>
      e.statut === 'oui' &&
      !(e.cle === 'source-proteines' && oui.has('riche-proteines')) &&
      !(e.cle === 'source-fibres' && oui.has('riche-fibres')),
  );
}

/** Part de l'énergie apportée par un macronutriment (bornes), en %. */
export function partEnergie(b: Bilan, n: 'proteines' | 'glucides' | 'lipides'): { bas: number; haut: number } {
  const r = rapport(multiplier(b.valeurs[n], KCAL_PAR_G[n]), b.valeurs.kcal);
  return { bas: r.bas * 100, haut: r.haut * 100 };
}

// --- Objectifs et journées ---------------------------------------------------------------------

export type Objectifs = { kcalMin?: number; kcalMax?: number; proteinesMin?: number; proteinesMax?: number };
export type PositionObjectif = 'sous' | 'dans' | 'au-dessus' | 'indetermine' | 'sans-objectif';

/** Position d'une valeur (intervalle) par rapport à une plage cible [min, max]. */
export function positionObjectif(x: Intervalle, min?: number, max?: number): PositionObjectif {
  if (min === undefined && max === undefined) return 'sans-objectif';
  const haut = x.max;
  if (max !== undefined && x.min > max) return 'au-dessus';
  if (min !== undefined && haut !== null && haut < min) return 'sous';
  const basOk = min === undefined || x.min >= min;
  const hautOk = max === undefined || (haut !== null && haut <= max);
  return basOk && hautOk ? 'dans' : 'indetermine';
}

export type PersonneNutrition = { id: string; coefFeculents: number };
export type RepasCompte = { recette: string; nom: string; moment: string; portions: number };
export type JourNutrition = { date: string; parPersonne: Map<string, { bilan: Bilan; repas: RepasCompte[] }> };

/**
 * Total par jour et par personne des repas de la semaine (plats du plan uniquement : petit-déjeuner,
 * collations et repas hors plan ne sont pas comptés). Une personne mange une portion par repas, ou
 * `repas.portions` réparties entre les mangeurs du repas.
 */
export function nutritionSemaine(plan: Plan, semaine: Semaine, table: TableCiqual, personnes: PersonneNutrition[]): JourNutrition[] {
  const catalogue = new Map(plan.ingredients.map((i) => [i.id, i]));
  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  const coef = new Map(personnes.map((p) => [p.id, p.coefFeculents]));
  const tous = plan.personnes.map((p) => p.id);
  const jours = new Map<string, JourNutrition>();
  for (const plat of semaine.plats) {
    const r = recettes.get(plat.recette);
    if (!r) continue;
    const mangeursPlat = (plat.pour ?? tous).map((id) => ({ id, coefFeculents: coef.get(id) ?? 1 }));
    const n = nutritionRecette(r, catalogue, table, mangeursPlat);
    for (const repas of plat.repas ?? []) {
      const pour = repas.pour ?? plat.pour ?? tous;
      const portionsChacun = (repas.portions ?? pour.length) / pour.length;
      const jour = jours.get(repas.date) ?? { date: repas.date, parPersonne: new Map() };
      jours.set(repas.date, jour);
      for (const id of pour) {
        const b = n.parPersonne.get(id) ?? n.portion;
        const actuel = jour.parPersonne.get(id) ?? { bilan: bilanVide(), repas: [] };
        jour.parPersonne.set(id, {
          bilan: additionnerBilans([actuel.bilan, multiplierBilan(b, portionsChacun)]),
          repas: [...actuel.repas, { recette: r.id, nom: r.nom, moment: repas.moment, portions: portionsChacun }],
        });
      }
    }
  }
  return [...jours.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// --- Affichage --------------------------------------------------------------------------------

const nf = (d: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** « 412 », « 3,2 », « 0 à 0,4 », « ≥ 12 » (max inconnu). Arrondi d'affichage seulement. */
export function formaterIntervalle(x: Intervalle, n: Nutriment | 'pct'): string {
  const d = n === 'kcal' || n === 'pct' ? 0 : n === 'sel' ? 2 : 1;
  const f = (v: number) => nf(d).format(v);
  if (x.max === null) return `≥ ${f(x.min)}`;
  if (f(x.min) === f(x.max)) return f(x.min);
  return `${f(x.min)} à ${f(x.max)}`;
}
