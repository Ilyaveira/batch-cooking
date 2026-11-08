// Réorganisation des étapes d'une session depuis l'app.
// Les modifications sont gardées à part du plan importé (ordre + heures modifiées) : le plan
// reste intact, un réimport conserve les modifications, et l'on peut revenir à l'original.
//
// Invariant : l'ordre obtenu est toujours chronologique (heures croissantes ou égales), ce qui
// permet à etapesTriees / planning / minuteurs de fonctionner sans changement.
import { formaterHeureSession, minutesDepuisDebut } from './dates';
import type { EtapeSession, Plan, Session } from './schema/plan';
import { etapesTriees } from './session';

export type Personnalisation = {
  /** Ids des étapes dans l'ordre voulu. */
  ordre: string[];
  /** Heures de début modifiées (id → « h:mm »). */
  heures: Record<string, string>;
};

const min = (e: EtapeSession) => minutesDepuisDebut(e.debut);

/** Insère `e` après la dernière étape dont l'heure est ≤ la sienne. */
function insererSelonHeure(liste: EtapeSession[], e: EtapeSession): EtapeSession[] {
  let i = liste.length;
  while (i > 0 && min(liste[i - 1]!) > min(e)) i--;
  return [...liste.slice(0, i), e, ...liste.slice(i)];
}

/**
 * Session telle qu'affichée : ordre et heures personnalisés appliqués.
 * Étapes absentes de l'ordre (ajoutées par un réimport) : insérées selon leur heure.
 * Ids de l'ordre qui n'existent plus dans le plan : ignorés.
 */
export function appliquerPersonnalisation(session: Session, perso?: Personnalisation | null): Session {
  if (!perso) return session;
  const etapes = session.etapes.map((e) => (perso.heures[e.id] ? { ...e, debut: perso.heures[e.id]! } : e));
  const parId = new Map(etapes.map((e) => [e.id, e]));
  let resultat = perso.ordre.filter((id) => parId.has(id)).map((id) => parId.get(id)!);
  const places = new Set(resultat.map((e) => e.id));
  for (const e of etapesTriees({ ...session, etapes: etapes.filter((x) => !places.has(x.id)) })) {
    resultat = insererSelonHeure(resultat, e);
  }
  return { ...session, etapes: resultat };
}

/** Écart entre une session réorganisée et l'original ; null si rien ne diffère. */
export function personnalisationDe(affichee: EtapeSession[], origine: Session): Personnalisation | null {
  const debutsOrigine = new Map(origine.etapes.map((e) => [e.id, e.debut]));
  const heures: Record<string, string> = {};
  for (const e of affichee) if (debutsOrigine.get(e.id) !== e.debut) heures[e.id] = e.debut;
  const ordre = affichee.map((e) => e.id);
  const ordreOrigine = etapesTriees(origine).map((e) => e.id);
  const memeOrdre = ordre.length === ordreOrigine.length && ordre.every((id, i) => id === ordreOrigine[i]);
  if (memeOrdre && Object.keys(heures).length === 0) return null;
  return { ordre, heures };
}

export class ErreurReorganisation extends Error {}

/**
 * Déplace une étape à la position `position` (1 = première). Les suivantes sont décalées et
 * l'étape prend l'heure de celle dont elle prend la place, pour rester chronologique.
 */
export function deplacerEtape(affichee: Session, origine: Session, id: string, position: number): Personnalisation | null {
  const liste = etapesTriees(affichee);
  const n = liste.length;
  if (!Number.isInteger(position) || position < 1 || position > n)
    throw new ErreurReorganisation(`Le numéro doit être compris entre 1 et ${n}.`);
  const i = liste.findIndex((e) => e.id === id);
  if (i < 0) throw new ErreurReorganisation(`Étape « ${id} » introuvable.`);
  const k = position - 1;
  if (k === i) return personnalisationDe(liste, origine);
  const cible = liste[k]!;
  const deplacee = { ...liste[i]!, debut: cible.debut };
  const sans = liste.filter((_, j) => j !== i);
  const nouvelle = [...sans.slice(0, k), deplacee, ...sans.slice(k)];
  return personnalisationDe(nouvelle, origine);
}

/**
 * Lit une heure de session saisie au clavier : « 1:30 », « 1h30 », « 1.30 », « 1,30 » ou « 130 ».
 * Une saisie ambiguë (« 1,5 ») est refusée plutôt que devinée.
 * Renvoie « h:mm », ou null si la saisie n'est pas une heure valide.
 */
export function lireHeureSession(texte: string): string | null {
  const t = texte.trim().toLowerCase();
  let h: number;
  let mn: number;
  // Après « . » ou « , », deux chiffres obligatoires : « 1,5 » (1 h 30 ou 1:05 ?) est refusé.
  const separe = t.match(/^(\d{1,2})\s*(?:[:h]\s*(\d{1,2})|[.,](\d{2}))$/);
  const chiffres = t.match(/^\d{1,4}$/);
  if (separe) {
    h = Number(separe[1]);
    mn = Number(separe[2] ?? separe[3]);
  } else if (chiffres) {
    // « 5 » = 0:05 ; « 130 » = 1:30 ; « 1015 » = 10:15
    h = t.length <= 2 ? 0 : Number(t.slice(0, -2));
    mn = Number(t.slice(-2));
  } else return null;
  if (mn > 59) return null;
  return formaterHeureSession(h * 60 + mn);
}

/** Change l'heure d'une étape ; elle se replace d'elle-même dans l'ordre chronologique. */
export function changerHeure(affichee: Session, origine: Session, id: string, saisie: string): Personnalisation | null {
  const heure = lireHeureSession(saisie);
  if (!heure) throw new ErreurReorganisation('Heure attendue au format h:mm depuis le début de la session (ex. 0:25 ou 1:30).');
  const liste = etapesTriees(affichee);
  const e = liste.find((x) => x.id === id);
  if (!e) throw new ErreurReorganisation(`Étape « ${id} » introuvable.`);
  const nouvelle = insererSelonHeure(
    liste.filter((x) => x.id !== id),
    { ...e, debut: heure },
  );
  return personnalisationDe(nouvelle, origine);
}

/** Plan à exporter : sessions avec l'ordre et les heures modifiés (clé : numéro de semaine). */
export function planAvecPersonnalisations(plan: Plan, persos: Map<number, Personnalisation>): Plan {
  return {
    ...plan,
    semaines: plan.semaines.map((s) =>
      s.session && persos.has(s.numero) ? { ...s, session: appliquerPersonnalisation(s.session, persos.get(s.numero)) } : s,
    ),
  };
}
