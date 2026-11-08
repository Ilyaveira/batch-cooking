// Personnalisation des étapes d'une session depuis l'app : ordre, heures, textes, étapes
// scindées et fusionnées. Elle est gardée à part du plan importé, sous forme d'écart avec lui :
// le plan reste intact, un réimport conserve les modifications (les étapes non touchées
// reprennent le contenu du nouveau plan) et l'on peut tout annuler.
//
// Invariants : la liste affichée est chronologique (heures croissantes ou égales) et les membres
// d'une fusion sont contigus et à la même heure ; etapesTriees / planning / minuteurs
// (src/domain/session.ts) fonctionnent donc sans changement.
import { formaterHeureSession, minutesDepuisDebut } from './dates';
import type { EtapeSession, Plan, Session } from './schema/plan';
import { etapesTriees } from './session';

export type TexteModifie = { texte: string; details?: string[] };

/** Étape créée en scindant une étape du plan (`source` = id de l'étape du plan d'origine). */
export type EtapeAjoutee = EtapeSession & { source: string };

/** Étape telle qu'affichée : `source` n'est présent que sur les parties issues d'une scission. */
export type EtapeAffichee = EtapeSession & { source?: string };

export type Personnalisation = {
  /** Ids des étapes dans l'ordre voulu. */
  ordre: string[];
  /** Heures de début modifiées des étapes du plan (id → « h:mm »). */
  heures: Record<string, string>;
  /** Textes réécrits des étapes du plan. */
  textes?: Record<string, TexteModifie>;
  /** Parties créées par « Scinder ». */
  ajouts?: Record<string, EtapeAjoutee>;
  /** Fusions : id → groupe (null = détachée d'un groupe venu du plan). */
  groupes?: Record<string, string | null>;
};

export class ErreurReorganisation extends Error {}

const min = (e: EtapeSession) => minutesDepuisDebut(e.debut);
const memesListes = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Insère `e` après la dernière étape dont l'heure est ≤ la sienne. */
function insererSelonHeure<T extends EtapeSession>(liste: T[], e: T): T[] {
  let i = liste.length;
  while (i > 0 && min(liste[i - 1]!) > min(e)) i--;
  return [...liste.slice(0, i), e, ...liste.slice(i)];
}

/**
 * Session telle qu'affichée : modifications appliquées au plan.
 * - ids de l'ordre qui n'existent plus dans le plan : ignorés ;
 * - parties scindées dont l'étape d'origine a disparu : ignorées ;
 * - étapes du plan absentes de l'ordre (ajoutées par un réimport) : insérées selon leur heure.
 */
export function appliquerPersonnalisation(session: Session, perso?: Personnalisation | null): Session {
  if (!perso) return session;
  const idsPlan = new Set(session.etapes.map((e) => e.id));
  const appliquerGroupe = (e: EtapeAffichee): EtapeAffichee => {
    if (!perso.groupes || !(e.id in perso.groupes)) return e;
    const g = perso.groupes[e.id];
    const { groupe: _ancien, ...reste } = e;
    return g ? { ...reste, groupe: g } : reste;
  };
  const duPlan: EtapeAffichee[] = session.etapes.map((e) => {
    const t = perso.textes?.[e.id];
    const h = perso.heures[e.id];
    return appliquerGroupe({ ...e, ...(h ? { debut: h } : {}), ...(t ? { texte: t.texte, details: t.details } : {}) });
  });
  for (const e of duPlan) if (e.details === undefined) delete e.details;
  const ajouts = Object.values(perso.ajouts ?? {}).filter((a) => idsPlan.has(a.source));
  const parId = new Map<string, EtapeAffichee>([...duPlan, ...ajouts].map((e) => [e.id, e]));

  let resultat = perso.ordre.filter((id) => parId.has(id)).map((id) => parId.get(id)!);
  const places = new Set(resultat.map((e) => e.id));
  // Parties scindées absentes de l'ordre : juste après leur étape d'origine.
  for (const a of ajouts.filter((x) => !places.has(x.id))) {
    const i = resultat.findIndex((e) => e.id === a.source);
    resultat = i < 0 ? insererSelonHeure(resultat, a) : [...resultat.slice(0, i + 1), a, ...resultat.slice(i + 1)];
    places.add(a.id);
  }
  for (const e of etapesTriees({ ...session, etapes: duPlan.filter((x) => !places.has(x.id)) })) {
    resultat = insererSelonHeure(resultat, e);
  }
  return { ...session, etapes: resultat };
}

/** Écart entre une liste affichée et le plan d'origine ; null si rien ne diffère. */
export function personnalisationDe(affichee: EtapeAffichee[], origine: Session): Personnalisation | null {
  const duPlan = new Map(origine.etapes.map((e) => [e.id, e]));
  const p: Required<Personnalisation> = { ordre: affichee.map((e) => e.id), heures: {}, textes: {}, ajouts: {}, groupes: {} };
  for (const e of affichee) {
    const o = duPlan.get(e.id);
    if (!o) {
      if (!e.source) throw new ErreurReorganisation(`Étape « ${e.id} » sans origine.`);
      p.ajouts[e.id] = { ...e, source: e.source };
      continue;
    }
    if (e.debut !== o.debut) p.heures[e.id] = e.debut;
    if (e.texte !== o.texte || !memesListes(e.details, o.details))
      p.textes[e.id] = e.details?.length ? { texte: e.texte, details: e.details } : { texte: e.texte };
    if ((e.groupe ?? null) !== (o.groupe ?? null)) p.groupes[e.id] = e.groupe ?? null;
  }
  const memeOrdre = memesListes(p.ordre, etapesTriees(origine).map((e) => e.id));
  const vide = (o: object) => Object.keys(o).length === 0;
  if (memeOrdre && vide(p.heures) && vide(p.textes) && vide(p.ajouts) && vide(p.groupes)) return null;
  const r: Personnalisation = { ordre: p.ordre, heures: p.heures };
  if (!vide(p.textes)) r.textes = p.textes;
  if (!vide(p.ajouts)) r.ajouts = p.ajouts;
  if (!vide(p.groupes)) r.groupes = p.groupes;
  return r;
}

/** Bloc affiché : une étape seule, ou plusieurs étapes fusionnées (même `groupe`, contiguës). */
export type Bloc = { id: string; debut: string; membres: EtapeAffichee[] };

export function blocs(session: Session): Bloc[] {
  const liste: Bloc[] = [];
  for (const e of etapesTriees(session) as EtapeAffichee[]) {
    const dernier = liste.at(-1);
    if (dernier && e.groupe && dernier.membres.at(-1)!.groupe === e.groupe) dernier.membres.push(e);
    else liste.push({ id: e.id, debut: e.debut, membres: [e] });
  }
  return liste;
}

const aplatir = (liste: Bloc[]) => liste.flatMap((b) => b.membres);
const avecHeure = (b: Bloc, debut: string): Bloc => ({ ...b, debut, membres: b.membres.map((m) => ({ ...m, debut })) });

function trouverBloc(liste: Bloc[], id: string): number {
  const i = liste.findIndex((b) => b.membres.some((m) => m.id === id));
  if (i < 0) throw new ErreurReorganisation(`Étape « ${id} » introuvable.`);
  return i;
}

/**
 * Déplace une étape (ou une fusion entière) à la position `position` (1 = première). Les
 * suivantes sont décalées et le bloc prend l'heure de celui dont il prend la place.
 */
export function deplacerEtape(affichee: Session, origine: Session, id: string, position: number): Personnalisation | null {
  const liste = blocs(affichee);
  const n = liste.length;
  if (!Number.isInteger(position) || position < 1 || position > n)
    throw new ErreurReorganisation(`Le numéro doit être compris entre 1 et ${n}.`);
  const i = trouverBloc(liste, id);
  const k = position - 1;
  if (k === i) return personnalisationDe(aplatir(liste), origine);
  const deplace = avecHeure(liste[i]!, liste[k]!.debut);
  const sans = liste.filter((_, j) => j !== i);
  return personnalisationDe(aplatir([...sans.slice(0, k), deplace, ...sans.slice(k)]), origine);
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

/** Change l'heure d'une étape (ou d'une fusion) ; elle se replace d'elle-même. */
export function changerHeure(affichee: Session, origine: Session, id: string, saisie: string): Personnalisation | null {
  const heure = lireHeureSession(saisie);
  if (!heure) throw new ErreurReorganisation('Heure attendue au format h:mm depuis le début de la session (ex. 0:25 ou 1:30).');
  const liste = blocs(affichee);
  const i = trouverBloc(liste, id);
  const bloc = avecHeure(liste[i]!, heure);
  const sans = liste.filter((_, j) => j !== i);
  let k = sans.length;
  while (k > 0 && minutesDepuisDebut(sans[k - 1]!.debut) > minutesDepuisDebut(heure)) k--;
  return personnalisationDe(aplatir([...sans.slice(0, k), bloc, ...sans.slice(k)]), origine);
}

/** Saisie d'une étape : 1ʳᵉ(s) ligne(s) = consigne ; lignes commençant par « - » = sous-points. */
export function formaterSaisieEtape(e: Pick<EtapeSession, 'texte' | 'details'>): string {
  return [e.texte, ...(e.details ?? []).map((d) => `- ${d}`)].join('\n');
}

export function lireSaisieEtape(saisie: string): TexteModifie {
  const lignes = saisie.split('\n').map((l) => l.trim()).filter(Boolean);
  const details = lignes.filter((l) => /^[-•]/.test(l)).map((l) => l.replace(/^[-•]\s*/, '')).filter(Boolean);
  const texte = lignes.filter((l) => !/^[-•]/.test(l)).join(' ');
  if (!texte) throw new ErreurReorganisation('La consigne de l’étape ne peut pas être vide (les lignes « - » sont des sous-points).');
  return details.length ? { texte, details } : { texte };
}

function remplacer(liste: EtapeAffichee[], id: string, f: (e: EtapeAffichee) => EtapeAffichee[]): EtapeAffichee[] {
  const i = liste.findIndex((e) => e.id === id);
  if (i < 0) throw new ErreurReorganisation(`Étape « ${id} » introuvable.`);
  return [...liste.slice(0, i), ...f(liste[i]!), ...liste.slice(i + 1)];
}

const avecTexte = (e: EtapeAffichee, t: TexteModifie): EtapeAffichee => {
  const { details: _d, ...reste } = e;
  return t.details ? { ...reste, texte: t.texte, details: t.details } : { ...reste, texte: t.texte };
};

/** Réécrit la consigne et les sous-points d'une étape. */
export function modifierTexte(affichee: Session, origine: Session, id: string, saisie: string): Personnalisation | null {
  const t = lireSaisieEtape(saisie);
  return personnalisationDe(remplacer(etapesTriees(affichee), id, (e) => [avecTexte(e, t)]), origine);
}

/** Propose une coupure : après la 1ʳᵉ phrase, sinon consigne / sous-points. */
export function proposerCoupure(e: Pick<EtapeSession, 'texte' | 'details'>): [string, string] {
  const m = e.texte.match(/^(.+?[.!?])\s+(\S.*)$/);
  if (m) return [m[1]!, formaterSaisieEtape({ texte: m[2]!, details: e.details })];
  if (e.details?.length) return [e.texte, e.details.join('\n')];
  return [e.texte, ''];
}

/**
 * Coupe une étape en deux. La 1ʳᵉ partie garde l'heure, les durées et le minuteur ; la 2ᵉ commence
 * à la même heure, juste après, sans minuteur ni alerte (déplaçable ensuite).
 */
export function scinderEtape(affichee: Session, origine: Session, id: string, saisie1: string, saisie2: string): Personnalisation | null {
  const t1 = lireSaisieEtape(saisie1);
  if (!saisie2.trim()) throw new ErreurReorganisation('La 2ᵉ partie est vide : rien à scinder.');
  const t2 = lireSaisieEtape(saisie2);
  const liste = etapesTriees(affichee) as EtapeAffichee[];
  const existants = new Set([...liste.map((e) => e.id), ...origine.etapes.map((e) => e.id)]);
  return personnalisationDe(
    remplacer(liste, id, (e) => {
      const lettres = 'bcdefghijklmnopqrstuvwxyz';
      const racine = e.source ? e.id.replace(/-[a-z]$/, '') : e.id;
      const nouvelId = [...lettres].map((l) => `${racine}-${l}`).find((x) => !existants.has(x));
      if (!nouvelId) throw new ErreurReorganisation('Trop de scissions pour cette étape.');
      const partie2: EtapeAffichee = {
        id: nouvelId,
        source: e.source ?? e.id,
        debut: e.debut,
        poste: e.poste,
        actifMin: 0,
        ...(e.tache ? { tache: e.tache } : {}),
        ...(e.recettes ? { recettes: e.recettes } : {}),
        ...(e.groupe ? { groupe: e.groupe } : {}),
        texte: t2.texte,
        ...(t2.details ? { details: t2.details } : {}),
      };
      return [avecTexte(e, t1), partie2];
    }),
    origine,
  );
}

/**
 * Fusionne une étape (ou une fusion) avec le bloc suivant : une seule carte, à l'heure de la 1ʳᵉ.
 * Les étapes restent distinctes dans les données : durées et minuteurs sont tous conservés.
 */
export function fusionnerAvecSuivante(affichee: Session, origine: Session, id: string): Personnalisation | null {
  const liste = blocs(affichee);
  const i = trouverBloc(liste, id);
  const a = liste[i]!;
  const b = liste[i + 1];
  if (!b) throw new ErreurReorganisation('C’est la dernière étape : rien à fusionner après elle.');
  const groupe = a.membres[0]!.groupe ?? a.membres[0]!.id;
  const fusion: Bloc = {
    id: a.id,
    debut: a.debut,
    membres: [...a.membres, ...b.membres].map((m) => ({ ...m, debut: a.debut, groupe })),
  };
  return personnalisationDe(aplatir([...liste.slice(0, i), fusion, ...liste.slice(i + 2)]), origine);
}

/** Défait une fusion : chaque étape redevient une carte (à la même heure). */
export function separerFusion(affichee: Session, origine: Session, id: string): Personnalisation | null {
  const liste = blocs(affichee);
  const i = trouverBloc(liste, id);
  const membres = liste[i]!.membres.map(({ groupe: _g, ...m }) => m);
  return personnalisationDe(aplatir([...liste.slice(0, i), ...membres.map((m) => ({ id: m.id, debut: m.debut, membres: [m] })), ...liste.slice(i + 1)]), origine);
}

/** Session exportable : sans les champs internes à l'app. */
function pourExport(session: Session): Session {
  return { ...session, etapes: session.etapes.map(({ source: _s, ...e }: EtapeAffichee) => e) };
}

/** Plan à exporter : sessions avec les modifications faites dans l'app (clé : numéro de semaine). */
export function planAvecPersonnalisations(plan: Plan, persos: Map<number, Personnalisation>): Plan {
  return {
    ...plan,
    semaines: plan.semaines.map((s) =>
      s.session && persos.has(s.numero) ? { ...s, session: pourExport(appliquerPersonnalisation(s.session, persos.get(s.numero))) } : s,
    ),
  };
}
