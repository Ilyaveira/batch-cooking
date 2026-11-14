// Hooks d'accès aux données pour l'interface (requêtes réactives Dexie).
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../data/db';
import {
  cochagesAvecPrefixe,
  cocher,
  lirePersonnalisation,
  lireReglages,
  listerEtiquettesPerso,
  listerInfosIngredients,
  listerRecettesPerso,
} from '../data/depot';
import type { EtiquettesPerso } from '../domain/bibliotheque';
import { lireTableCiqual, type FichierCiqual, type TableCiqual } from '../domain/nutrition';
import { appliquerInfosIngredients, appliquerRecettesMois, type InfosIngredientPerso, type RecettePerso } from '../domain/modifications';
import { REGLAGES_DEFAUT, type Reglages } from '../domain/reglages';
import type { Plan, Semaine } from '../domain/schema/plan';

const CLE_PLAN_ACTIF = 'batch-plan-actif';

function lireLocal(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}
function ecrireLocal(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible : on garde la valeur en mémoire seulement */
  }
}

/** Liste des plans importés (undefined pendant le chargement). */
export function usePlans() {
  return useLiveQuery(async () => (await db.plans.toArray()).sort((a, b) => b.id.localeCompare(a.id)));
}

/** Plan affiché : celui choisi, sinon le plus récent. `null` = aucun plan importé. */
export type PlanActif = {
  /** Plan effectif : plan importé + infos d'ingrédients + modifications de recettes du mois. */
  plan: Plan | null | undefined;
  /** Plan tel qu'importé (pour « revenir à la recette du plan » et l'export). */
  planImporte: Plan | null | undefined;
  infos: InfosIngredientPerso[];
  /** Modifications de recettes du mois affiché (mois et semaines). */
  recettesPerso: RecettePerso[];
  /** Lignes de modifications ignorées (ingrédient disparu après un réimport). */
  ignorees: string[];
  choisir: (mois: string) => void;
};

export function usePlanActif(): PlanActif {
  const plans = usePlans();
  const [choisi, setChoisi] = useState(() => lireLocal(CLE_PLAN_ACTIF));
  const choisir = useCallback((mois: string) => {
    ecrireLocal(CLE_PLAN_ACTIF, mois);
    setChoisi(mois);
  }, []);
  const p = plans === undefined ? undefined : (plans.find((x) => x.id === choisi) ?? plans[0] ?? null);
  const mois = p?.id;
  const infos = useLiveQuery(() => listerInfosIngredients());
  // Même précaution que usePersonnalisation : ignorer une réponse qui concerne un autre mois.
  const r = useLiveQuery(async () => ({ mois, persos: mois ? await listerRecettesPerso(mois) : [] }), [mois]);
  const persos = r && r.mois === mois ? r.persos : undefined;
  const chargement = { plan: undefined, planImporte: undefined, infos: [], recettesPerso: [], ignorees: [], choisir };
  if (p === undefined || infos === undefined || persos === undefined) return chargement;
  if (p === null) return { ...chargement, plan: null, planImporte: null };
  const { plan, ignorees } = appliquerRecettesMois(appliquerInfosIngredients(p.plan, infos), persos);
  return { plan, planImporte: p.plan, infos, recettesPerso: persos, ignorees, choisir };
}

let promesseCiqual: Promise<TableCiqual> | null = null;

/** Charge la table Ciqual 2025 (fichier pré-caché pour le hors-ligne), une seule fois. */
export function chargerCiqual(): Promise<TableCiqual> {
  promesseCiqual ??= fetch(`${import.meta.env.BASE_URL}data/ciqual-2025.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Table Ciqual indisponible (HTTP ${r.status}).`);
      return r.json() as Promise<FichierCiqual>;
    })
    .then(lireTableCiqual)
    .catch((e: unknown) => {
      promesseCiqual = null;
      throw e;
    });
  return promesseCiqual;
}

/** Table Ciqual : undefined pendant le chargement, Error en cas d'échec. */
export function useCiqual(): TableCiqual | Error | undefined {
  const [t, setT] = useState<TableCiqual | Error | undefined>(undefined);
  useEffect(() => {
    let actif = true;
    chargerCiqual().then(
      (x) => actif && setT(x),
      (e: unknown) => actif && setT(e instanceof Error ? e : new Error(String(e))),
    );
    return () => {
      actif = false;
    };
  }, []);
  return t;
}

/** Étiquettes modifiées dans l'app, par recette. */
export function useEtiquettesPerso(): Map<string, EtiquettesPerso> | undefined {
  const l = useLiveQuery(() => listerEtiquettesPerso());
  return l && new Map(l.map((e) => [e.recetteId, e]));
}

export function useReglages(): Reglages {
  return useLiveQuery(() => lireReglages(), [], REGLAGES_DEFAUT) ?? REGLAGES_DEFAUT;
}

/** Cases cochées dont la clé commence par `prefixe`, avec une fonction pour basculer. */
export function useCochages(prefixe: string) {
  const coches = useLiveQuery(() => cochagesAvecPrefixe(prefixe), [prefixe], new Set<string>()) ?? new Set<string>();
  const basculer = useCallback((cle: string) => cocher(cle, !coches.has(cle)), [coches]);
  return { coches, basculer };
}

/**
 * Ordre et heures des étapes modifiés dans l'app pour une semaine.
 * undefined = en cours de chargement ; null = ordre du plan.
 */
export function usePersonnalisation(mois: string | undefined, semaine: number) {
  // useLiveQuery renvoie l'ancien résultat pendant qu'il relance la requête : on vérifie que la
  // réponse correspond bien au mois et à la semaine demandés, sinon l'écran afficherait
  // brièvement l'ordre du plan avant l'ordre modifié.
  const cle = `${mois}|${semaine}`;
  const r = useLiveQuery(async () => ({ cle, perso: mois ? await lirePersonnalisation(mois, semaine) : null }), [cle]);
  return r?.cle === cle ? r.perso : undefined;
}

/** Semaine « en cours » : la dernière dont la session est passée (ou la première). */
export function semaineCourante(plan: Plan, aujourdhui = new Date().toISOString().slice(0, 10)): Semaine {
  const passees = plan.semaines.filter((s) => s.dateSession <= aujourdhui);
  return passees.at(-1) ?? plan.semaines[0]!;
}

/** Garde l'écran allumé tant que le composant est affiché (Screen Wake Lock API). */
export function useEcranAllume(actif: boolean): 'actif' | 'indisponible' | 'refuse' | 'inactif' {
  const [etat, setEtat] = useState<'actif' | 'indisponible' | 'refuse' | 'inactif'>('inactif');
  useEffect(() => {
    if (!actif) return;
    if (!('wakeLock' in navigator)) {
      setEtat('indisponible');
      return;
    }
    let verrou: WakeLockSentinel | null = null;
    let fini = false;
    const demander = async () => {
      try {
        verrou = await navigator.wakeLock.request('screen');
        if (fini) await verrou.release();
        else setEtat('actif');
        verrou.addEventListener('release', () => !fini && setEtat('inactif'));
      } catch {
        setEtat('refuse');
      }
    };
    // Le verrou saute quand l'app passe en arrière-plan : on le redemande au retour.
    const auRetour = () => document.visibilityState === 'visible' && void demander();
    void demander();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      fini = true;
      document.removeEventListener('visibilitychange', auRetour);
      void verrou?.release();
    };
  }, [actif]);
  return etat;
}
