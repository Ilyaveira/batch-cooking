// Listes fermées partagées par le schéma, les calculs et l'interface.
// Chaque liste est MECE : une valeur et une seule s'applique, « autre » couvre le reste.

export const RAYONS = [
  'fruits-legumes',
  'boucherie-poissonnerie',
  'cremerie',
  'epicerie',
  'surgeles',
  'autre',
] as const;
export type Rayon = (typeof RAYONS)[number];

export const LIBELLES_RAYON: Record<Rayon, string> = {
  'fruits-legumes': 'Fruits et légumes',
  'boucherie-poissonnerie': 'Boucherie et poissonnerie',
  cremerie: 'Crèmerie',
  epicerie: 'Épicerie',
  surgeles: 'Surgelés',
  autre: 'Autre',
};

/** Où l'ingrédient se trouve à la maison (sert à « à sortir »). */
export const STOCKAGES = ['frigo', 'congelateur', 'legumes', 'placard'] as const;
export type Stockage = (typeof STOCKAGES)[number];

export const LIBELLES_STOCKAGE: Record<Stockage, string> = {
  frigo: 'Frigo',
  congelateur: 'Congélateur',
  legumes: 'Légumes',
  placard: 'Placard',
};

/** Stockage par défaut quand le plan ne le précise pas. */
export const STOCKAGE_PAR_RAYON: Record<Rayon, Stockage> = {
  'fruits-legumes': 'legumes',
  'boucherie-poissonnerie': 'frigo',
  cremerie: 'frigo',
  epicerie: 'placard',
  surgeles: 'congelateur',
  autre: 'placard',
};

export const UNITES = [
  'g',
  'kg',
  'ml',
  'cl',
  'l',
  'piece',
  'botte',
  'gousse',
  'tranche',
  'sachet',
  'boite',
  'pot',
  'cas',
  'cac',
  'pincee',
] as const;
export type Unite = (typeof UNITES)[number];

export const POSTES = ['plan-de-travail', 'feux', 'four', 'cook-expert'] as const;
export type Poste = (typeof POSTES)[number];

export const LIBELLES_POSTE: Record<Poste, string> = {
  'plan-de-travail': 'Plan de travail',
  feux: 'Feux',
  four: 'Four',
  'cook-expert': 'Cook Expert',
};

export const MOMENTS = ['midi', 'soir'] as const;
export type Moment = (typeof MOMENTS)[number];

export const SAISONS = ['printemps', 'ete', 'automne', 'hiver'] as const;
export type Saison = (typeof SAISONS)[number];

export const LIBELLES_SAISON: Record<Saison, string> = {
  printemps: 'Printemps',
  ete: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
};

export const FECULENTS = [
  'riz',
  'pates',
  'semoule',
  'legumineuses',
  'pommes-de-terre',
  'pain',
  'autre',
] as const;
export type Feculent = (typeof FECULENTS)[number];

export const LIBELLES_FECULENT: Record<Feculent, string> = {
  riz: 'Riz',
  pates: 'Pâtes',
  semoule: 'Semoule',
  legumineuses: 'Légumineuses',
  'pommes-de-terre': 'Pommes de terre',
  pain: 'Pain / tortillas',
  autre: 'Autre féculent',
};

export const MODES_FOUR = ['traditionnel', 'chaleur-tournante'] as const;
export type ModeFour = (typeof MODES_FOUR)[number];

export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;
