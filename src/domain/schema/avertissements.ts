// Contrôles non bloquants : le plan est importable, mais quelque chose mérite un coup d'œil.
import { ajouterJours, jourSemaine, minutesDepuisDebut } from '../dates';
import type { Plan } from './plan';

export type Avertissement = { chemin: string; message: string };

export function avertissementsPlan(plan: Plan): Avertissement[] {
  const av: Avertissement[] = [];
  const nbPersonnes = plan.personnes.length;

  plan.semaines.forEach((s, i) => {
    const base = `semaines[${i}] (semaine ${s.numero})`;
    if (jourSemaine(s.dateSession) !== 0)
      av.push({ chemin: `${base}.dateSession`, message: `le ${s.dateSession} n’est pas un dimanche.` });

    const finSemaine = ajouterJours(s.dateSession, 6);
    s.plats.forEach((p, j) => {
      const chemin = `${base}.plats[${j}] (« ${p.recette} »)`;
      if (!p.repas || p.repas.length === 0) {
        av.push({ chemin, message: 'aucun repas indiqué : le plat n’apparaîtra pas dans « quand manger quoi ».' });
        return;
      }
      let total = 0;
      p.repas.forEach((r, k) => {
        if (r.date > finSemaine)
          av.push({ chemin: `${chemin}.repas[${k}]`, message: `le ${r.date} est plus de 6 jours après la session.` });
        total += r.portions ?? (r.pour ?? p.pour)?.length ?? nbPersonnes;
      });
      if (total > p.portions)
        av.push({ chemin, message: `les repas consomment ${total} portions pour ${p.portions} cuisinées.` });
    });

    const etapes = s.session?.etapes ?? [];
    for (let k = 1; k < etapes.length; k++) {
      if (minutesDepuisDebut(etapes[k]!.debut) < minutesDepuisDebut(etapes[k - 1]!.debut)) {
        av.push({
          chemin: `${base}.session.etapes[${k}]`,
          message: `l’étape « ${etapes[k]!.id} » (${etapes[k]!.debut}) commence avant la précédente : l’app les affiche triées par heure.`,
        });
      }
    }
  });

  const sansQuantite = plan.recettes.flatMap((r) =>
    r.ingredients.filter((l) => l.quantite === null).map((l) => `${r.id} → ${l.ingredient}`),
  );
  if (sansQuantite.length > 0)
    av.push({
      chemin: 'recettes',
      message: `${sansQuantite.length} quantité(s) non précisée(s) dans la source, signalée(s) dans les courses : ${sansQuantite.join(', ')}.`,
    });

  return av;
}
