// Réglages de l'utilisateur (restent sur le téléphone) et valeurs par défaut sourcées.
import type { ModeFour } from './constantes';

export type SourceRef = { libelle: string; url: string };

export type TypeConservation = {
  cle: string;
  libelle: string;
  /** Borne basse de la durée recommandée, en jours après la session (J0 = jour de cuisson). */
  joursMin: number;
  /** Borne haute : au-delà, le repas est signalé en rouge. */
  joursMax: number;
  source?: SourceRef;
  note?: string;
};

export type PersonneReglages = { id: string; nom: string; exclusions: string[] };

export type Reglages = {
  personnes: PersonneReglages[];
  conservation: TypeConservation[];
  four: { mode: ModeFour; decalageChaleurTournanteC: number };
  cookExpert: boolean;
  /** Dernier jour affiché dans « quand manger quoi » : 0 = dimanche … 4 = jeudi … 6 = samedi. */
  dernierJour: number;
};

const FOODSAFETY: SourceRef = {
  libelle: 'FoodSafety.gov — Cold Food Storage Chart',
  url: 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
};
const NSW: SourceRef = {
  libelle: 'NSW Food Authority — Leftovers',
  url: 'https://www.foodauthority.nsw.gov.au/node/23948',
};
const FSS: SourceRef = {
  libelle: 'Food Standards Scotland — Food storage',
  url: 'https://www.foodstandards.gov.scot/consumer-advice/food-safety/food-safety-in-the-kitchen/food-storage',
};

const NOTE_REPRISE = 'Valeur reprise du plan de novembre, qui cite cette source ; à vérifier sur la page source.';

/**
 * Durées par défaut : uniquement celles fournies par l'utilisatrice ou citées (avec source) dans
 * son plan de novembre. Aucune autre valeur n'est ajoutée : un type absent se crée dans les réglages.
 */
export const CONSERVATION_DEFAUT: TypeConservation[] = [
  { cle: 'plat-cuisine', libelle: 'Plats cuisinés (viande, volaille)', joursMin: 3, joursMax: 4, source: FOODSAFETY, note: NOTE_REPRISE },
  { cle: 'soupe', libelle: 'Soupes et veloutés', joursMin: 3, joursMax: 4, source: FOODSAFETY, note: NOTE_REPRISE },
  { cle: 'quiche', libelle: 'Quiche', joursMin: 3, joursMax: 5, source: FOODSAFETY, note: NOTE_REPRISE },
  { cle: 'oeufs-durs', libelle: 'Œufs durs', joursMin: 7, joursMax: 7, source: FOODSAFETY, note: NOTE_REPRISE },
  { cle: 'pates', libelle: 'Pâtes cuites', joursMin: 2, joursMax: 2, source: NSW, note: NOTE_REPRISE },
  {
    cle: 'riz',
    libelle: 'Riz cuit',
    joursMin: 2,
    joursMax: 2,
    source: NSW,
    note: `${NOTE_REPRISE} Food Standards Scotland conseille 24 h (${FSS.url}).`,
  },
  { cle: 'poisson-cru', libelle: 'Poisson cru', joursMin: 1, joursMax: 3, source: FOODSAFETY, note: NOTE_REPRISE },
];

export const REGLAGES_DEFAUT: Reglages = {
  personnes: [],
  conservation: CONSERVATION_DEFAUT,
  four: { mode: 'chaleur-tournante', decalageChaleurTournanteC: 20 },
  cookExpert: true,
  dernierJour: 4,
};

/** Température à afficher selon le four de l'utilisatrice. */
export function temperatureAffichee(
  temperatureC: number,
  modeRecette: ModeFour,
  four: Reglages['four'],
): { valeurC: number; ajustee: boolean } {
  if (modeRecette === four.mode) return { valeurC: temperatureC, ajustee: false };
  const d = four.decalageChaleurTournanteC;
  return {
    valeurC: four.mode === 'chaleur-tournante' ? temperatureC - d : temperatureC + d,
    ajustee: true,
  };
}

/**
 * Ajoute, après chaque température d'un texte (« 210 °C »), la valeur pour le four de
 * l'utilisatrice quand le mode diffère : « 210 °C (190 °C en chaleur tournante) ».
 */
export function annoterTemperatures(texte: string, modeTexte: ModeFour, four: Reglages['four']): string {
  if (modeTexte === four.mode) return texte;
  const libelle = four.mode === 'chaleur-tournante' ? 'en chaleur tournante' : 'en four traditionnel';
  return texte.replace(/(\d{2,3})\s?°C/g, (m, t: string) => {
    const { valeurC } = temperatureAffichee(Number(t), modeTexte, four);
    return `${m} (${valeurC} °C ${libelle})`;
  });
}
