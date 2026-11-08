// Notation des recettes après les avoir cuisinées : facilité et goût de 1 à 5, par personne,
// avec un commentaire et la date. Historique complet ; moyennes, tri et filtres calculés ici.
// Une recette sans note n'a pas de moyenne (null) : aucune valeur n'est supposée.

export type Note = {
  id: string;
  recetteId: string;
  personneId: string;
  /** AAAA-MM-JJ */
  date: string;
  /** 1 à 5, ou null si la personne n'a noté que le goût. */
  facilite: number | null;
  /** 1 à 5, ou null si la personne n'a noté que la facilité. */
  gout: number | null;
  commentaire?: string;
};

export type Moyennes = { nb: number; gout: number | null; facilite: number | null };
export type ResumeNotes = Moyennes & { derniere: string | null; parPersonne: Record<string, Moyennes> };

export class ErreurNote extends Error {}

const valeurOk = (v: number | null) => v === null || (Number.isInteger(v) && v >= 1 && v <= 5);

/** Contrôle une note avant enregistrement. */
export function verifierNote(n: Omit<Note, 'id'>): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) throw new ErreurNote('Date attendue au format AAAA-MM-JJ.');
  if (!valeurOk(n.facilite) || !valeurOk(n.gout)) throw new ErreurNote('Les notes vont de 1 à 5.');
  if (n.facilite === null && n.gout === null) throw new ErreurNote('Donnez au moins une note (facilité ou goût).');
}

function moyenne(valeurs: (number | null)[]): number | null {
  const v = valeurs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function moyennes(notes: Note[]): Moyennes {
  return { nb: notes.length, gout: moyenne(notes.map((n) => n.gout)), facilite: moyenne(notes.map((n) => n.facilite)) };
}

/** Résumé par recette : moyennes globales et par personne, date de la dernière note. */
export function resumerNotes(notes: Note[]): Map<string, ResumeNotes> {
  const parRecette = new Map<string, Note[]>();
  for (const n of notes) parRecette.set(n.recetteId, [...(parRecette.get(n.recetteId) ?? []), n]);
  const res = new Map<string, ResumeNotes>();
  for (const [id, liste] of parRecette) {
    const parPersonne: Record<string, Moyennes> = {};
    for (const p of new Set(liste.map((n) => n.personneId))) parPersonne[p] = moyennes(liste.filter((n) => n.personneId === p));
    res.set(id, { ...moyennes(liste), derniere: liste.map((n) => n.date).sort().at(-1) ?? null, parPersonne });
  }
  return res;
}

export type CritereTri = 'nom' | 'gout' | 'facilite' | 'recent';
export type FiltreNote = 'toutes' | 'jamais' | 'gout3' | 'gout4' | 'gout5';

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

/** Trie des recettes ; celles sans la valeur triée (jamais notées) vont à la fin, par nom. */
export function trierRecettes<T extends { id: string; nom: string }>(liste: T[], resumes: Map<string, ResumeNotes>, critere: CritereTri): T[] {
  const cle = (r: T): number | string | null => {
    const s = resumes.get(r.id);
    if (critere === 'gout') return s?.gout ?? null;
    if (critere === 'facilite') return s?.facilite ?? null;
    if (critere === 'recent') return s?.derniere ?? null;
    return null;
  };
  return [...liste].sort((a, b) => {
    if (critere !== 'nom') {
      const ka = cle(a);
      const kb = cle(b);
      if (ka === null && kb !== null) return 1;
      if (kb === null && ka !== null) return -1;
      if (ka !== null && kb !== null && ka !== kb) return ka < kb ? 1 : -1; // décroissant
    }
    return collator.compare(a.nom, b.nom);
  });
}

export function filtrerParNote(resume: ResumeNotes | undefined, filtre: FiltreNote): boolean {
  if (filtre === 'toutes') return true;
  if (filtre === 'jamais') return !resume;
  const seuil = { gout3: 3, gout4: 4, gout5: 5 }[filtre];
  return resume?.gout != null && resume.gout >= seuil;
}

/** « 4,5 » ; « – » quand il n'y a pas de note. */
export function formaterMoyenne(v: number | null): string {
  return v === null ? '–' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Math.round(v * 10) / 10);
}

/** Fichier d'export des notes, lisible par Claude pour préparer le mois suivant. */
export function exporterNotes(
  notes: Note[],
  recettes: Map<string, string>,
  personnes: Map<string, string>,
  maintenant = new Date(),
) {
  const resumes = resumerNotes(notes);
  return {
    format: 'batch-cooking-notes',
    version: 1,
    exporteLe: maintenant.toISOString(),
    echelle: 'facilite et gout de 1 (mauvais) à 5 (excellent) ; null = non noté',
    recettes: [...resumes.entries()]
      .map(([id, r]) => ({
        id,
        nom: recettes.get(id) ?? id,
        nbNotes: r.nb,
        gout: r.gout === null ? null : Math.round(r.gout * 10) / 10,
        facilite: r.facilite === null ? null : Math.round(r.facilite * 10) / 10,
        derniereFois: r.derniere,
        notes: notes
          .filter((n) => n.recetteId === id)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((n) => ({
            date: n.date,
            personne: personnes.get(n.personneId) ?? n.personneId,
            facilite: n.facilite,
            gout: n.gout,
            ...(n.commentaire ? { commentaire: n.commentaire } : {}),
          })),
      }))
      .sort((a, b) => collator.compare(a.nom, b.nom)),
  };
}
