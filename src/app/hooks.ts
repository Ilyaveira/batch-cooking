// Hooks d'accès aux données pour l'interface (requêtes réactives Dexie).
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../data/db';
import { cochagesAvecPrefixe, cocher, lireReglages } from '../data/depot';
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
export function usePlanActif(): { plan: Plan | null | undefined; choisir: (mois: string) => void } {
  const plans = usePlans();
  const [choisi, setChoisi] = useState(() => lireLocal(CLE_PLAN_ACTIF));
  const choisir = useCallback((mois: string) => {
    ecrireLocal(CLE_PLAN_ACTIF, mois);
    setChoisi(mois);
  }, []);
  if (plans === undefined) return { plan: undefined, choisir };
  const p = plans.find((x) => x.id === choisi) ?? plans[0];
  return { plan: p?.plan ?? null, choisir };
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
