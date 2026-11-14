// Base IndexedDB (Dexie). Chaque enregistrement porte majLe / appareil (et supprimeLe pour
// les suppressions logiques) afin de pouvoir synchroniser deux téléphones plus tard
// (fusion « dernière écriture gagne » enregistrement par enregistrement).
import Dexie, { type EntityTable } from 'dexie';
import type { Ingredient, Plan, Recette } from '../domain/schema/plan';
import type { Reglages } from '../domain/reglages';
import type { InfosIngredientPerso, RecettePerso } from '../domain/modifications';
import type { Note } from '../domain/notation';
import type { Personnalisation } from '../domain/reorganisation';

type Meta = { majLe: number; appareil: string; supprimeLe?: number };

/** Un plan mensuel importé, conservé tel quel (clé : le mois « AAAA-MM »). */
export type PlanEnregistre = Meta & { id: string; plan: Plan; importeLe: number };

/** Une recette de la bibliothèque, avec les ingrédients qu'elle cite (autonome). */
export type RecetteEnregistree = Meta & { id: string; recette: Recette; ingredients: Ingredient[]; moisOrigine: string };

/** Une case cochée (courses, placard, étape). Clé : « mois|type|semaine|élément ». */
export type Cochage = Meta & { cle: string; coche: boolean };

export type ReglagesEnregistres = Meta & { cle: 'reglages'; valeur: Reglages };

/** Ordre et heures des étapes modifiés dans l'app. Clé : « mois|semaine ». */
export type PersonnalisationEnregistree = Meta & Personnalisation & { cle: string; mois: string; semaine: number };

/** Une note donnée par une personne à une recette, un jour donné (historique). */
export type NoteEnregistree = Meta & Note;

/** Infos d'un ingrédient modifiées ou ingrédient créé dans l'app (pour tous les mois). */
export type IngredientPersoEnregistre = Meta & InfosIngredientPerso;

/** Lignes d'ingrédients d'une recette modifiées. Clé : « mois|semaine|recette » (semaine 0 = mois). */
export type RecettePersoEnregistree = Meta & RecettePerso & { cle: string };

export class BaseBatch extends Dexie {
  plans!: EntityTable<PlanEnregistre, 'id'>;
  recettes!: EntityTable<RecetteEnregistree, 'id'>;
  cochages!: EntityTable<Cochage, 'cle'>;
  reglages!: EntityTable<ReglagesEnregistres, 'cle'>;
  personnalisations!: EntityTable<PersonnalisationEnregistree, 'cle'>;
  notations!: EntityTable<NoteEnregistree, 'id'>;
  ingredientsPerso!: EntityTable<IngredientPersoEnregistre, 'id'>;
  recettesPerso!: EntityTable<RecettePersoEnregistree, 'cle'>;

  constructor(nom = 'batch-cooking') {
    super(nom);
    this.version(1).stores({
      plans: 'id, majLe',
      recettes: 'id, majLe, moisOrigine',
      cochages: 'cle, majLe',
      reglages: 'cle',
    });
    // v2 : réorganisation des étapes de session (les données v1 sont conservées telles quelles).
    this.version(2).stores({ personnalisations: 'cle, mois, majLe' });
    // v3 : notation des recettes (historique). Les données v1/v2 sont conservées.
    this.version(3).stores({ notations: 'id, recetteId, majLe' });
    // v4 : modifications des ingrédients (infos globales, lignes de recettes par mois/semaine).
    this.version(4).stores({ ingredientsPerso: 'id, majLe', recettesPerso: 'cle, mois, majLe' });
  }
}

export const db = new BaseBatch();

/** Identifiant aléatoire de cet appareil, gardé dans le navigateur. */
export function idAppareil(): string {
  try {
    let id = localStorage.getItem('batch-appareil');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('batch-appareil', id);
    }
    return id;
  } catch {
    return 'inconnu';
  }
}

export function meta(): Meta {
  return { majLe: Date.now(), appareil: idAppareil() };
}
