// Validation d'un plan importé : JSON → erreurs bloquantes (en français, avec chemin)
// ou plan typé + avertissements non bloquants.
import { z } from 'zod';
import { fr } from 'zod/locales';
import { planSchema, type Plan } from './plan';
import { avertissementsPlan, type Avertissement } from './avertissements';

z.config(fr());

export type ErreurValidation = { chemin: string; message: string };

export type ResultatValidation =
  | { ok: true; plan: Plan; avertissements: Avertissement[] }
  | { ok: false; erreurs: ErreurValidation[] };

/** ['semaines', 1, 'plats', 2] → « semaines[1].plats[2] » */
export function formaterChemin(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, p) => {
    if (typeof p === 'number') return `${acc}[${p}]`;
    return acc ? `${acc}.${String(p)}` : String(p);
  }, '');
}

/** Ajoute un repère lisible : identifiant de la recette, numéro de semaine… */
function contexte(brut: unknown, path: readonly PropertyKey[]): string {
  const [racine, index] = path;
  if (typeof index !== 'number' || typeof brut !== 'object' || brut === null) return '';
  const liste = (brut as Record<string, unknown>)[String(racine)];
  if (!Array.isArray(liste)) return '';
  const el = liste[index] as Record<string, unknown> | undefined;
  if (!el) return '';
  if (racine === 'semaines' && typeof el.numero === 'number') return ` (semaine ${el.numero})`;
  if (typeof el.id === 'string') return ` (« ${el.id} »)`;
  return '';
}

export function validerPlan(entree: unknown): ResultatValidation {
  let brut = entree;
  if (typeof entree === 'string') {
    try {
      brut = JSON.parse(entree);
    } catch (e) {
      return {
        ok: false,
        erreurs: [{ chemin: '(fichier)', message: `Ce n’est pas du JSON valide : ${(e as Error).message}` }],
      };
    }
  }
  if (typeof brut === 'object' && brut !== null && (brut as Record<string, unknown>).format !== 'batch-cooking-plan') {
    return {
      ok: false,
      erreurs: [
        {
          chemin: 'format',
          message: 'Le champ « format » doit valoir « batch-cooking-plan ». Ce fichier ne semble pas être un plan généré selon SCHEMA.md.',
        },
      ],
    };
  }
  const res = planSchema.safeParse(brut);
  if (!res.success) {
    return {
      ok: false,
      erreurs: res.error.issues.map((iss) => ({
        chemin: (formaterChemin(iss.path) || '(racine)') + contexte(brut, iss.path),
        message: iss.message,
      })),
    };
  }
  return { ok: true, plan: res.data, avertissements: avertissementsPlan(res.data) };
}
