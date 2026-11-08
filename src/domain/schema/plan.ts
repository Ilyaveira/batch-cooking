// Schéma du plan mensuel (format d'échange v1).
// Source unique : les types TypeScript, la validation à l'import et le JSON Schema
// publié (public/schema/plan-v1.schema.json) sont tous dérivés de ce fichier.
import { z } from 'zod';
import {
  FECULENTS,
  MODES_FOUR,
  MOMENTS,
  POSTES,
  RAYONS,
  SAISONS,
  STOCKAGES,
  UNITES,
} from '../constantes';

const ID = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'identifiant attendu en minuscules, chiffres et tirets (ex. « riz-basmati »)');

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ');

const HEURE_SESSION = z
  .string()
  .regex(/^\d{1,2}:[0-5]\d$/, 'heure attendue au format h:mm depuis le début de la session (ex. « 0:05 », « 1:30 »)');

/** Quantité : nombre positif, ou null quand la source ne la précise pas (jamais devinée). */
const QUANTITE = z
  .number()
  .positive()
  .nullable()
  .describe('Quantité positive dans l’unité indiquée ; null si la source ne la précise pas (ne pas estimer).');

export const ingredientSchema = z.strictObject({
  id: ID.describe('Identifiant unique de l’ingrédient, réutilisé dans les recettes.'),
  nom: z.string().min(1).describe('Nom affiché, au singulier ou tel qu’acheté (ex. « Lentilles vertes »).'),
  rayon: z.enum(RAYONS).describe('Rayon du magasin, pour trier la liste de courses.'),
  stockage: z
    .enum(STOCKAGES)
    .optional()
    .describe('Où il est rangé à la maison (« à sortir »). Par défaut déduit du rayon.'),
  placard: z
    .boolean()
    .optional()
    .describe('true = produit de fond de placard (épices, huiles…) : vérifié une fois par mois, absent des courses hebdomadaires.'),
  ciqual: z
    .object({ code: z.string().regex(/^\d+$/, 'code Ciqual numérique attendu') })
    .optional()
    .describe('Code de l’aliment dans la table Ciqual de l’ANSES (aliment cru ou cuit selon l’état pesé).'),
  off: z
    .object({ codeBarres: z.string().regex(/^\d{8,14}$/, 'code-barres EAN de 8 à 14 chiffres attendu') })
    .optional()
    .describe('Code-barres Open Food Facts pour un produit de marque.'),
  masseParUnite: z
    .partialRecord(z.enum(UNITES), z.number().positive())
    .optional()
    .describe('Masse en grammes d’une unité non massique (ex. {"piece": 60} pour un œuf), si elle est connue. Sert au calcul nutritionnel ; ne jamais l’inventer.'),
});

export const ligneIngredientSchema = z.strictObject({
  ingredient: ID.describe('id d’un élément de « ingredients ».'),
  quantite: QUANTITE,
  unite: z.enum(UNITES),
  note: z.string().optional().describe('Précision libre (« en cubes de 2 cm », « durs »…).'),
  facultatif: z.boolean().optional(),
});

export const recetteSchema = z.strictObject({
  id: ID,
  nom: z.string().min(1),
  portions: z.number().int().positive().describe('Nombre de portions pour lesquelles les quantités sont écrites.'),
  conservation: z
    .array(ID)
    .min(1)
    .optional()
    .describe('Clés des types de conservation (réglages de l’app) : « plat-cuisine », « soupe », « quiche », « oeufs-durs », « pates », « riz », « poisson-cru »… Le plus court s’applique.'),
  tags: z
    .object({
      saisons: z.array(z.enum(SAISONS)).optional(),
      vegetarien: z.boolean().optional(),
      feculents: z.array(z.enum(FECULENTS)).optional(),
      libres: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  durees: z
    .object({
      preparationMin: z.number().int().nonnegative().optional(),
      cuissonMin: z.number().int().nonnegative().optional(),
    })
    .optional(),
  ustensiles: z.array(z.string().min(1)).optional(),
  four: z
    .object({
      temperatureC: z.number().int().min(30).max(300),
      mode: z.enum(MODES_FOUR).describe('Mode pour lequel la température est écrite.'),
    })
    .optional(),
  ingredients: z.array(ligneIngredientSchema).min(1),
  etapes: z.array(z.string().min(1)).optional().describe('Étapes de la recette seule (hors session), dans l’ordre.'),
  source: z.string().optional().describe('Origine de la recette (lien, livre…).'),
});

export const repasSchema = z.strictObject({
  date: DATE,
  moment: z.enum(MOMENTS),
  portions: z.number().int().positive().optional().describe('Portions mangées à ce repas ; par défaut, le nombre de personnes concernées.'),
  pour: z.array(ID).optional().describe('ids de « personnes » ; par défaut celles du plat.'),
  aPreparer: z.string().optional().describe('Ce qui se fait à la minute ce jour-là (assembler, cuire la semoule…).'),
  aPreparerMin: z.number().int().positive().optional(),
});

export const platSchema = z.strictObject({
  recette: ID.describe('id d’une recette de « recettes ».'),
  portions: z.number().int().positive().describe('Portions cuisinées cette semaine (les quantités de la recette sont mises à l’échelle).'),
  pour: z.array(ID).optional().describe('ids de « personnes » qui mangent ce plat ; par défaut, tout le monde.'),
  repas: z.array(repasSchema).optional().describe('Quand le plat est mangé. Deux repas ou plus = plat « en double ».'),
});

export const etapeSessionSchema = z.strictObject({
  id: ID,
  debut: HEURE_SESSION,
  poste: z.enum(POSTES),
  tache: ID.optional().describe('id d’une « tache » de la session : ligne du planning (Gantt).'),
  actifMin: z.number().int().nonnegative().describe('Minutes de travail actif.'),
  passifMin: z.number().int().nonnegative().optional().describe('Minutes de cuisson passive qui suivent la partie active (sert aux minuteurs).'),
  rappelsMin: z
    .array(z.number().int().positive())
    .optional()
    .describe('Rappels en minutes après le début de l’étape (ex. remuer toutes les 10 min : [10, 20, 30]).'),
  alerte: z.boolean().optional().describe('true = action courte à ne pas rater (couper le feu, égoutter…).'),
  texte: z.string().min(1).describe('Consigne courte. Seul le gras **…** est interprété (ingrédients et quantités).'),
  details: z.array(z.string().min(1)).optional().describe('Sous-points (plaque 1, plaque 2…).'),
  recettes: z.array(ID).optional().describe('ids des recettes concernées.'),
  groupe: ID.optional().describe(
    'Étapes fusionnées : des étapes consécutives de même « groupe » s’affichent comme une seule carte (même heure conseillée), chacune gardant ses durées et son minuteur.',
  ),
});

export const sessionSchema = z.strictObject({
  dureeMin: z.number().int().positive().optional(),
  modeFour: z
    .enum(MODES_FOUR)
    .optional()
    .describe('Mode de four pour lequel les températures des étapes sont écrites (par défaut : traditionnel).'),
  ustensiles: z.array(z.string().min(1)).optional(),
  taches: z.array(z.strictObject({ id: ID, libelle: z.string().min(1) })).optional(),
  etapes: z.array(etapeSessionSchema).min(1),
});

export const ligneCoursesSchema = z.strictObject({
  ingredient: ID,
  quantite: QUANTITE,
  unite: z.enum(UNITES),
  note: z.string().optional(),
});

export const semaineSchema = z.strictObject({
  numero: z.number().int().min(1).max(6),
  dateSession: DATE.describe('Date du dimanche de session.'),
  titre: z.string().optional(),
  plats: z.array(platSchema).min(1),
  coursesSupplementaires: z
    .array(ligneCoursesSchema)
    .optional()
    .describe('Achats hors recettes (fruits du dessert…).'),
  session: sessionSchema.optional(),
});

export const placardSchema = z.strictObject({
  ingredient: ID,
  quantite: QUANTITE.optional(),
  unite: z.enum(UNITES).optional(),
  note: z.string().optional(),
});

const planObjet = z.strictObject({
  format: z.literal('batch-cooking-plan'),
  version: z.literal(1),
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mois attendu au format AAAA-MM'),
  titre: z.string().min(1),
  personnes: z
    .array(z.strictObject({ id: ID, nom: z.string().min(1) }))
    .min(1)
    .describe('Les personnes du foyer.'),
  ingredients: z.array(ingredientSchema).min(1),
  recettes: z.array(recetteSchema).min(1),
  semaines: z.array(semaineSchema).min(1),
  placard: z.array(placardSchema).optional(),
});

/** Schéma « structurel » (sans contrôles croisés) : sert à générer le JSON Schema. */
export const planStructureSchema = planObjet;

type Ctx = z.RefinementCtx;

function verifierUnicite(ids: string[], chemin: (i: number) => (string | number)[], quoi: string, ctx: Ctx) {
  const vus = new Map<string, number>();
  ids.forEach((id, i) => {
    if (vus.has(id)) {
      ctx.addIssue({ code: 'custom', path: chemin(i), message: `${quoi} « ${id} » est en double (déjà utilisé à l’indice ${vus.get(id)}).` });
    } else vus.set(id, i);
  });
}

/** Schéma complet : structure + références croisées. */
export const planSchema = planObjet.superRefine((plan, ctx) => {
  const ingredients = new Set(plan.ingredients.map((i) => i.id));
  const recettes = new Set(plan.recettes.map((r) => r.id));
  const personnes = new Set(plan.personnes.map((p) => p.id));

  verifierUnicite(plan.personnes.map((p) => p.id), (i) => ['personnes', i, 'id'], 'La personne', ctx);
  verifierUnicite(plan.ingredients.map((x) => x.id), (i) => ['ingredients', i, 'id'], 'L’ingrédient', ctx);
  verifierUnicite(plan.recettes.map((x) => x.id), (i) => ['recettes', i, 'id'], 'La recette', ctx);
  verifierUnicite(plan.semaines.map((s) => String(s.numero)), (i) => ['semaines', i, 'numero'], 'La semaine', ctx);

  const refIngredient = (id: string, path: (string | number)[]) => {
    if (!ingredients.has(id))
      ctx.addIssue({ code: 'custom', path, message: `l’ingrédient « ${id} » n’existe pas dans « ingredients ».` });
  };
  const refRecette = (id: string, path: (string | number)[]) => {
    if (!recettes.has(id))
      ctx.addIssue({ code: 'custom', path, message: `la recette « ${id} » n’existe pas dans « recettes ».` });
  };
  const refPersonnes = (ids: string[] | undefined, path: (string | number)[]) => {
    ids?.forEach((id, k) => {
      if (!personnes.has(id))
        ctx.addIssue({ code: 'custom', path: [...path, k], message: `la personne « ${id} » n’existe pas dans « personnes ».` });
    });
  };

  plan.recettes.forEach((r, i) =>
    r.ingredients.forEach((l, j) => refIngredient(l.ingredient, ['recettes', i, 'ingredients', j, 'ingredient'])),
  );
  plan.placard?.forEach((l, i) => refIngredient(l.ingredient, ['placard', i, 'ingredient']));

  plan.semaines.forEach((s, i) => {
    s.plats.forEach((p, j) => {
      refRecette(p.recette, ['semaines', i, 'plats', j, 'recette']);
      refPersonnes(p.pour, ['semaines', i, 'plats', j, 'pour']);
      p.repas?.forEach((r, k) => {
        refPersonnes(r.pour, ['semaines', i, 'plats', j, 'repas', k, 'pour']);
        if (r.date < s.dateSession)
          ctx.addIssue({
            code: 'custom',
            path: ['semaines', i, 'plats', j, 'repas', k, 'date'],
            message: `le repas du ${r.date} est antérieur à la session du ${s.dateSession}.`,
          });
      });
    });
    s.coursesSupplementaires?.forEach((l, j) =>
      refIngredient(l.ingredient, ['semaines', i, 'coursesSupplementaires', j, 'ingredient']),
    );
    if (s.session) {
      const taches = new Set((s.session.taches ?? []).map((t) => t.id));
      verifierUnicite((s.session.taches ?? []).map((t) => t.id), (k) => ['semaines', i, 'session', 'taches', k, 'id'], 'La tâche', ctx);
      verifierUnicite(s.session.etapes.map((e) => e.id), (k) => ['semaines', i, 'session', 'etapes', k, 'id'], 'L’étape', ctx);
      s.session.etapes.forEach((e, k) => {
        if (e.tache && !taches.has(e.tache))
          ctx.addIssue({
            code: 'custom',
            path: ['semaines', i, 'session', 'etapes', k, 'tache'],
            message: `la tâche « ${e.tache} » n’existe pas dans « session.taches ».`,
          });
        e.recettes?.forEach((r, m) => refRecette(r, ['semaines', i, 'session', 'etapes', k, 'recettes', m]));
      });
    }
  });
});

export type Plan = z.infer<typeof planObjet>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type LigneIngredient = z.infer<typeof ligneIngredientSchema>;
export type Recette = z.infer<typeof recetteSchema>;
export type Semaine = z.infer<typeof semaineSchema>;
export type Plat = z.infer<typeof platSchema>;
export type Repas = z.infer<typeof repasSchema>;
export type EtapeSession = z.infer<typeof etapeSessionSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type LigneCourses = z.infer<typeof ligneCoursesSchema>;
export type LignePlacard = z.infer<typeof placardSchema>;
