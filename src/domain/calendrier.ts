// « Quand manger quoi » : l'ordre des repas vient du plan ; on le vérifie contre
// les durées de conservation des réglages (J0 = jour de la session).
import type { Moment } from './constantes';
import { ajouterJours, joursEntre, nomJour } from './dates';
import type { Plan, Plat, Recette, Semaine } from './schema/plan';
import type { Reglages, TypeConservation } from './reglages';

export type Statut = 'ok' | 'limite' | 'depasse' | 'inconnu';

export type ConservationRetenue = {
  type: TypeConservation | null;
  /** Clés citées par la recette mais absentes des réglages. */
  clesInconnues: string[];
};

/** Parmi les types de la recette, le plus contraignant (borne haute la plus courte). */
export function conservationRecette(recette: Recette, reglages: Pick<Reglages, 'conservation'>): ConservationRetenue {
  const parCle = new Map(reglages.conservation.map((t) => [t.cle, t]));
  const connus: TypeConservation[] = [];
  const clesInconnues: string[] = [];
  for (const cle of recette.conservation ?? []) {
    const t = parCle.get(cle);
    if (t) connus.push(t);
    else clesInconnues.push(cle);
  }
  connus.sort((a, b) => a.joursMax - b.joursMax || a.joursMin - b.joursMin);
  return { type: connus[0] ?? null, clesInconnues };
}

export function statutConservation(jours: number, type: TypeConservation | null): Statut {
  if (!type) return 'inconnu';
  if (jours <= type.joursMin) return 'ok';
  if (jours <= type.joursMax) return 'limite';
  return 'depasse';
}

export type EntreeRepas = {
  plat: Plat;
  recette: Recette;
  jours: number;
  statut: Statut;
  conservation: ConservationRetenue;
  pour: string[];
  portions: number;
  aPreparer?: string;
  aPreparerMin?: number;
};

export type JourCalendrier = {
  date: string;
  nomJour: string;
  jours: number;
  repas: Record<Moment, EntreeRepas[]>;
};

export function calendrierSemaine(plan: Plan, semaine: Semaine, reglages: Pick<Reglages, 'conservation' | 'dernierJour'>) {
  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  const tous = plan.personnes.map((p) => p.id);
  const entrees: (EntreeRepas & { date: string; moment: Moment })[] = [];

  for (const plat of semaine.plats) {
    const recette = recettes.get(plat.recette)!;
    const conservation = conservationRecette(recette, reglages);
    for (const r of plat.repas ?? []) {
      const jours = joursEntre(semaine.dateSession, r.date);
      const pour = r.pour ?? plat.pour ?? tous;
      entrees.push({
        date: r.date,
        moment: r.moment,
        plat,
        recette,
        jours,
        statut: statutConservation(jours, conservation.type),
        conservation,
        pour,
        portions: r.portions ?? pour.length,
        aPreparer: r.aPreparer,
        aPreparerMin: r.aPreparerMin,
      });
    }
  }

  // Du dimanche de session au dernier jour réglé, prolongé si un repas tombe plus tard.
  const dernier = Math.max(reglages.dernierJour, ...entrees.map((e) => e.jours));
  const jours: JourCalendrier[] = [];
  for (let j = 0; j <= dernier; j++) {
    const date = ajouterJours(semaine.dateSession, j);
    const duJour = entrees.filter((e) => e.date === date);
    jours.push({
      date,
      nomJour: nomJour(date),
      jours: j,
      repas: {
        midi: duJour.filter((e) => e.moment === 'midi'),
        soir: duJour.filter((e) => e.moment === 'soir'),
      },
    });
  }
  const horsDelai = entrees.filter((e) => e.statut === 'depasse');
  return { jours, horsDelai };
}
