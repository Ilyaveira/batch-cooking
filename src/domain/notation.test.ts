import { describe, expect, it } from 'vitest';
import { exporterNotes, filtrerParNote, formaterMoyenne, resumerNotes, trierRecettes, verifierNote, type Note } from './notation';

const n = (id: string, recetteId: string, personneId: string, date: string, facilite: number | null, gout: number | null, commentaire?: string): Note => ({
  id,
  recetteId,
  personneId,
  date,
  facilite,
  gout,
  commentaire,
});

const notes: Note[] = [
  n('1', 'mujaddara', 'a', '2026-11-10', 4, 5, 'à refaire'),
  n('2', 'mujaddara', 'b', '2026-11-10', null, 3),
  n('3', 'mujaddara', 'a', '2026-12-06', 5, 4),
  n('4', 'cake', 'a', '2026-11-11', 2, 3, 'trop long'),
];
const recettes = [
  { id: 'cake', nom: 'Cake salé' },
  { id: 'mujaddara', nom: 'Mujaddara' },
  { id: 'veloute', nom: 'Velouté' },
];

describe('résumé des notes', () => {
  const r = resumerNotes(notes);

  it('moyennes globales, en ignorant les valeurs non notées', () => {
    const m = r.get('mujaddara')!;
    expect(m.nb).toBe(3);
    expect(m.gout).toBe(4); // (5 + 3 + 4) / 3
    expect(m.facilite).toBe(4.5); // (4 + 5) / 2, la note sans facilité est ignorée
    expect(m.derniere).toBe('2026-12-06');
  });

  it('moyennes par personne', () => {
    expect(r.get('mujaddara')!.parPersonne).toEqual({ a: { nb: 2, gout: 4.5, facilite: 4.5 }, b: { nb: 1, gout: 3, facilite: null } });
  });

  it('pas de résumé (donc pas de moyenne inventée) pour une recette jamais notée', () => {
    expect(r.has('veloute')).toBe(false);
  });
});

describe('tri et filtres', () => {
  const r = resumerNotes(notes);
  it('par goût décroissant, les recettes jamais notées en dernier', () => {
    expect(trierRecettes(recettes, r, 'gout').map((x) => x.id)).toEqual(['mujaddara', 'cake', 'veloute']);
  });
  it('par facilité, par date de dernière note, par nom', () => {
    expect(trierRecettes(recettes, r, 'facilite').map((x) => x.id)).toEqual(['mujaddara', 'cake', 'veloute']);
    expect(trierRecettes(recettes, r, 'recent').map((x) => x.id)).toEqual(['mujaddara', 'cake', 'veloute']);
    expect(trierRecettes(recettes, r, 'nom').map((x) => x.id)).toEqual(['cake', 'mujaddara', 'veloute']);
  });
  it('filtre « goût ≥ 4 » et « jamais notée »', () => {
    expect(recettes.filter((x) => filtrerParNote(r.get(x.id), 'gout4')).map((x) => x.id)).toEqual(['mujaddara']);
    expect(recettes.filter((x) => filtrerParNote(r.get(x.id), 'jamais')).map((x) => x.id)).toEqual(['veloute']);
    expect(recettes.filter((x) => filtrerParNote(r.get(x.id), 'toutes'))).toHaveLength(3);
  });
});

describe('contrôles et affichage', () => {
  it('refuse une note hors 1–5, une date invalide, ou aucune note', () => {
    const base = { recetteId: 'x', personneId: 'a', date: '2026-11-10', facilite: 3, gout: 4 };
    expect(() => verifierNote(base)).not.toThrow();
    expect(() => verifierNote({ ...base, gout: 6 })).toThrow(/1 à 5/);
    expect(() => verifierNote({ ...base, date: '10/11/2026' })).toThrow(/AAAA-MM-JJ/);
    expect(() => verifierNote({ ...base, facilite: null, gout: null })).toThrow(/au moins une/);
  });
  it('formate les moyennes à la française', () => {
    expect(formaterMoyenne(4.25)).toBe('4,3');
    expect(formaterMoyenne(4)).toBe('4');
    expect(formaterMoyenne(null)).toBe('–');
  });
});

describe('export des notes pour Claude', () => {
  it('par recette : moyennes, dernière fois, notes avec prénoms et commentaires', () => {
    const e = exporterNotes(
      notes,
      new Map(recettes.map((r) => [r.id, r.nom])),
      new Map([
        ['a', 'Apolline'],
        ['b', 'Aurélien'],
      ]),
      new Date('2026-12-07T10:00:00Z'),
    );
    expect(e.format).toBe('batch-cooking-notes');
    expect(e.recettes.map((r) => r.nom)).toEqual(['Cake salé', 'Mujaddara']);
    const m = e.recettes[1]!;
    expect([m.nbNotes, m.gout, m.facilite, m.derniereFois]).toEqual([3, 4, 4.5, '2026-12-06']);
    expect(m.notes[0]).toEqual({ date: '2026-11-10', personne: 'Apolline', facilite: 4, gout: 5, commentaire: 'à refaire' });
    expect(e.recettes[0]!.notes[0]!.commentaire).toBe('trop long');
  });
});
