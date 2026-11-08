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
  /** Durées modifiées des étapes du plan (minutes actives, cuisson passive). */
  durees?: Record<string, DureesEtape>;
};

export type DureesEtape = { actifMin: number; passifMin: number };

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
    const d = perso.durees?.[e.id];
    return appliquerGroupe({
      ...e,
      ...(h ? { debut: h } : {}),
      ...(t ? { texte: t.texte, details: t.details } : {}),
      ...(d ? { actifMin: d.actifMin, passifMin: d.passifMin } : {}),
    });
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
  const p: Required<Personnalisation> = {
    ordre: affichee.map((e) => e.id),
    heures: {},
    textes: {},
    ajouts: {},
    groupes: {},
    durees: {},
  };
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
    if (e.actifMin !== o.actifMin || (e.passifMin ?? 0) !== (o.passifMin ?? 0))
      p.durees[e.id] = { actifMin: e.actifMin, passifMin: e.passifMin ?? 0 };
  }
  const memeOrdre = memesListes(p.ordre, etapesTriees(origine).map((e) => e.id));
  const vide = (o: object) => Object.keys(o).length === 0;
  if (memeOrdre && vide(p.heures) && vide(p.textes) && vide(p.ajouts) && vide(p.groupes) && vide(p.durees)) return null;
  const r: Personnalisation = { ordre: p.ordre, heures: p.heures };
  if (!vide(p.textes)) r.textes = p.textes;
  if (!vide(p.ajouts)) r.ajouts = p.ajouts;
  if (!vide(p.groupes)) r.groupes = p.groupes;
  if (!vide(p.durees)) r.durees = p.durees;
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

function trouverBloc(liste: Bloc[], id: string): number {
  const i = liste.findIndex((b) => b.membres.some((m) => m.id === id));
  if (i < 0) throw new ErreurReorganisation(`Étape « ${id} » introuvable.`);
  return i;
}

const decaler = (heure: string, delta: number) => formaterHeureSession(Math.max(0, minutesDepuisDebut(heure) + delta));

/**
 * Décale les heures de session écrites dans un texte (« À 1:08, sors-en 4 » → « À 1:00 » pour −8).
 * Seul le format h:mm est touché : ni « 210 °C », ni « 25 min ».
 */
export function decalerHeuresTexte(texte: string, delta: number): string {
  if (delta === 0) return texte;
  return texte.replace(/\b(\d{1,2}):([0-5]\d)\b/g, (h) => decaler(h, delta));
}

/** Étape décalée de `delta` minutes : heure de début et heures écrites dans son texte. */
function etapeDecalee(e: EtapeAffichee, delta: number): EtapeAffichee {
  const r: EtapeAffichee = { ...e, debut: decaler(e.debut, delta), texte: decalerHeuresTexte(e.texte, delta) };
  if (e.details) r.details = e.details.map((d) => decalerHeuresTexte(d, delta));
  return r;
}

const blocDecale = (b: Bloc, delta: number): Bloc => {
  const membres = b.membres.map((m) => etapeDecalee(m, delta));
  return { ...b, debut: membres[0]!.debut, membres };
};

/**
 * Replace le bloc `deplace` (déjà à sa nouvelle heure) et décale de `delta` les blocs contenant des
 * étapes liées à ses membres (chacun une seule fois), puis les réinsère par heure.
 * Étapes liées = étapes de la même tâche (même ligne du planning) dont l'heure est ≥ `seuil(membre)` :
 * au moins une minute après le membre pour un déplacement (deux étapes à la même heure, comme
 * préchauffer le four et mettre l'eau à bouillir, ne sont pas liées), ou la fin de la cuisson
 * pour un changement de durée.
 */
function avecLiees(
  liste: Bloc[],
  deplace: Bloc,
  ancien: Bloc,
  delta: number,
  seuil: (m: EtapeAffichee) => number,
  placer: (sans: Bloc[]) => Bloc[],
  origine: Session,
): EtapeAffichee[] {
  const toutes = aplatir(liste);
  const idsMembres = new Set(ancien.membres.map((m) => m.id));
  const idsLies = new Set<string>();
  if (delta !== 0) {
    for (const m of ancien.membres) {
      if (!m.tache) continue;
      for (const x of toutes) if (!idsMembres.has(x.id) && x.tache === m.tache && min(x) >= seuil(m) && x.id !== m.id) idsLies.add(x.id);
    }
  }
  const lies = liste.filter((b) => b !== ancien && b.membres.some((m) => idsLies.has(m.id)));
  const reste = placer(liste.filter((b) => b !== ancien && !lies.includes(b)));
  let resultat = reste.includes(deplace) ? reste : insererBloc(reste, deplace);
  // À heure égale, une étape liée reprend sa place relative du plan (ordre d'origine).
  const rangs = new Map(etapesTriees(origine).map((e, i) => [e.id, i]));
  const rang = (b: Bloc) => {
    const m = b.membres[0]!;
    return rangs.get(m.id) ?? (rangs.get(m.source ?? '') ?? Infinity) + 0.5;
  };
  for (const b of lies) resultat = insererBloc(resultat, blocDecale(b, delta), rang);
  return aplatir(resultat);
}

/**
 * Insère un bloc après le dernier bloc dont l'heure est ≤ la sienne ; avec `rang`, les égalités
 * d'heure sont départagées par ce rang (ordre du plan).
 */
function insererBloc(liste: Bloc[], b: Bloc, rang?: (b: Bloc) => number): Bloc[] {
  const t = minutesDepuisDebut(b.debut);
  let k = liste.length;
  while (k > 0) {
    const tPrec = minutesDepuisDebut(liste[k - 1]!.debut);
    if (tPrec > t || (rang && tPrec === t && rang(liste[k - 1]!) > rang(b))) k--;
    else break;
  }
  return [...liste.slice(0, k), b, ...liste.slice(k)];
}

/**
 * Déplace une étape (ou une fusion entière) à la position `position` (1 = première). Les
 * suivantes sont décalées, le bloc prend l'heure de celui dont il prend la place, et les étapes
 * liées (même tâche, plus tardives) bougent du même nombre de minutes.
 */
export function deplacerEtape(affichee: Session, origine: Session, id: string, position: number): Personnalisation | null {
  const liste = blocs(affichee);
  const n = liste.length;
  if (!Number.isInteger(position) || position < 1 || position > n)
    throw new ErreurReorganisation(`Le numéro doit être compris entre 1 et ${n}.`);
  const i = trouverBloc(liste, id);
  const k = position - 1;
  if (k === i) return personnalisationDe(aplatir(liste), origine);
  const ancien = liste[i]!;
  const delta = minutesDepuisDebut(liste[k]!.debut) - minutesDepuisDebut(ancien.debut);
  const deplace = blocDecale(ancien, delta);
  const cible = liste[k]!;
  return personnalisationDe(
    avecLiees(liste, deplace, ancien, delta, (m) => min(m) + 1, (sans) => {
      // Position choisie : juste avant (en montant) ou juste après (en descendant) le bloc visé.
      // Si le bloc visé est lui-même une étape liée (il se décale), on place selon l'heure.
      const j = sans.indexOf(cible);
      if (j < 0) return insererBloc(sans, deplace);
      const ou = k < i ? j : j + 1;
      return [...sans.slice(0, ou), deplace, ...sans.slice(ou)];
    }, origine),
    origine,
  );
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
  const ancien = liste[i]!;
  const delta = minutesDepuisDebut(heure) - minutesDepuisDebut(ancien.debut);
  const bloc = blocDecale(ancien, delta);
  return personnalisationDe(avecLiees(liste, bloc, ancien, delta, (m) => min(m) + 1, (sans) => sans, origine), origine);
}

/**
 * Change les durées d'une étape (minutes actives, cuisson passive) ; le minuteur suit. Si la fin
 * de l'étape change, les étapes liées qui étaient à la fin ou après sont décalées d'autant ;
 * celles prévues pendant la cuisson (ex. « retourne les légumes ») ne bougent pas.
 */
export function changerDurees(affichee: Session, origine: Session, id: string, actifMin: number, passifMin: number): Personnalisation | null {
  for (const v of [actifMin, passifMin])
    if (!Number.isInteger(v) || v < 0 || v > 600) throw new ErreurReorganisation('Durée attendue en minutes entières, entre 0 et 600.');
  const liste = blocs(affichee);
  const i = trouverBloc(liste, id);
  const ancien = liste[i]!;
  const e = ancien.membres.find((m) => m.id === id)!;
  const ancienneFin = min(e) + e.actifMin + (e.passifMin ?? 0);
  const delta = actifMin + passifMin - e.actifMin - (e.passifMin ?? 0);
  const modifiee: EtapeAffichee = { ...e, actifMin, passifMin };
  const bloc: Bloc = { ...ancien, membres: ancien.membres.map((m) => (m.id === id ? modifiee : m)) };
  // Seules les étapes liées à l'étape modifiée (pas aux autres membres du bloc) sont concernées.
  const pourLiees: Bloc = { ...ancien, membres: [e] };
  const liste2 = liste.map((b) => (b === ancien ? { ...b, membres: b.membres.filter((m) => m.id !== id) } : b)).filter((b) => b.membres.length > 0);
  const avecSeul = [...liste2, pourLiees];
  const resultat = avecLiees(avecSeul, pourLiees, pourLiees, delta, () => ancienneFin, (sans) => sans, origine);
  // Remet l'étape modifiée à sa place dans son bloc d'origine.
  const sansE = resultat.filter((x) => x.id !== id);
  const autres = bloc.membres.filter((m) => m.id !== id).map((m) => m.id);
  let pos = autres.length ? sansE.findIndex((x) => x.id === autres[0]) + ancien.membres.indexOf(e) : -1;
  if (pos < 0) pos = sansE.findIndex((x) => min(x) > min(e));
  if (pos < 0) pos = sansE.length;
  return personnalisationDe([...sansE.slice(0, pos), modifiee, ...sansE.slice(pos)], origine);
}

/**
 * Étapes qui tombent avant la fin d'une étape dont elles dépendent. Ne sont vérifiées que les
 * étapes qui, dans le plan importé, venaient à la fin ou après une étape de la même tâche
 * (une action prévue pendant la cuisson, comme retourner les légumes, n'est pas signalée).
 */
export function incoherences(affichee: Session, origine: Session): Map<string, string> {
  const res = new Map<string, string>();
  const finDe = (e: EtapeSession) => min(e) + e.actifMin + (e.passifMin ?? 0);
  const actuelles = new Map(affichee.etapes.map((e) => [e.id, e]));
  const court = (t: string) => {
    const s = t.replace(/\*\*/g, '');
    return s.length > 40 ? `${s.slice(0, 38)}…` : s;
  };
  for (const s of origine.etapes) {
    if (!s.tache) continue;
    const sAct = actuelles.get(s.id);
    if (!sAct) continue;
    let pire: { fin: number; texte: string } | null = null;
    for (const p of origine.etapes) {
      if (p.id === s.id || p.tache !== s.tache || min(p) > min(s) || min(s) < finDe(p) || (min(p) === min(s) && p.id >= s.id)) continue;
      const pAct = actuelles.get(p.id);
      if (!pAct) continue;
      const fin = finDe(pAct);
      if (min(sAct) < fin && (!pire || fin > pire.fin)) pire = { fin, texte: pAct.texte };
    }
    if (pire) res.set(s.id, `Avant la fin de « ${court(pire.texte)} » (fin ${formaterHeureSession(pire.fin)}).`);
  }
  return res;
}

/** Nombre d'étapes (hors `ids`) dont l'heure diffère entre deux versions de la session. */
export function compterDecalees(avant: Session, apres: Session, ids: string[]): number {
  const debuts = new Map(avant.etapes.map((e) => [e.id, e.debut]));
  return apres.etapes.filter((e) => !ids.includes(e.id) && debuts.has(e.id) && debuts.get(e.id) !== e.debut).length;
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
