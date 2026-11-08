// Notes d'une recette : formulaire (facilité et goût de 1 à 5 par personne, commentaire, date),
// moyennes et historique.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useReglages } from '../app/hooks';
import { ajouterNotes, notesDeRecette, supprimerNote } from '../data/depot';
import { dateLongue } from '../domain/dates';
import { ErreurNote, formaterMoyenne, resumerNotes, type Note } from '../domain/notation';

/** Date du jour sur le téléphone, au format AAAA-MM-JJ. */
const aujourdHui = () => new Date().toLocaleDateString('sv-SE');

/** 5 étoiles cliquables ; toucher l'étoile déjà choisie efface la note. */
export function Etoiles({ valeur, changer, libelle }: { valeur: number | null; changer: (v: number | null) => void; libelle: string }) {
  return (
    <span className="etoiles" role="radiogroup" aria-label={libelle}>
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valeur === v}
          aria-label={`${libelle} : ${v} sur 5`}
          className={valeur !== null && v <= valeur ? 'etoile pleine' : 'etoile'}
          onClick={() => changer(valeur === v ? null : v)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

/** Affichage en lecture seule : « ★★★★☆ ». */
export function EtoilesLecture({ valeur }: { valeur: number | null }) {
  if (valeur === null) return <span className="discret">non noté</span>;
  const n = Math.round(valeur);
  return (
    <span className="etoiles-lecture" aria-label={`${formaterMoyenne(valeur)} sur 5`}>
      {'★'.repeat(n)}
      <span className="etoile-vide">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

type Saisie = { facilite: number | null; gout: number | null; commentaire: string };

function Formulaire({ recetteId, fermer }: { recetteId: string; fermer: () => void }) {
  const reglages = useReglages();
  const [date, setDate] = useState(aujourdHui());
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const saisie = (id: string): Saisie => saisies[id] ?? { facilite: null, gout: null, commentaire: '' };
  const maj = (id: string, s: Partial<Saisie>) => setSaisies({ ...saisies, [id]: { ...saisie(id), ...s } });

  const enregistrer = async () => {
    // Une personne qui n'a rien noté (ni étoile, ni commentaire) est ignorée.
    const notes = reglages.personnes
      .map((p) => ({ p, s: saisie(p.id) }))
      .filter(({ s }) => s.facilite !== null || s.gout !== null || s.commentaire.trim())
      .map(({ p, s }) => ({
        recetteId,
        personneId: p.id,
        date,
        facilite: s.facilite,
        gout: s.gout,
        ...(s.commentaire.trim() ? { commentaire: s.commentaire.trim() } : {}),
      }));
    if (notes.length === 0) return setErreur('Donnez au moins une note.');
    try {
      await ajouterNotes(notes);
      fermer();
    } catch (e) {
      if (!(e instanceof ErreurNote)) throw e;
      setErreur(e.message);
    }
  };

  if (reglages.personnes.length === 0)
    return <p className="discret">Aucune personne dans les réglages : importez un plan pour les ajouter.</p>;

  return (
    <div className="formulaire-note">
      <label className="champ">
        Cuisinée le
        <input type="date" value={date} max={aujourdHui()} onChange={(e) => setDate(e.target.value)} />
      </label>
      {reglages.personnes.map((p) => (
        <fieldset key={p.id} className="note-personne">
          <legend>{p.nom}</legend>
          <div className="ligne-etoiles">
            <span>Facilité</span>
            <Etoiles valeur={saisie(p.id).facilite} changer={(v) => maj(p.id, { facilite: v })} libelle={`Facilité pour ${p.nom}`} />
          </div>
          <div className="ligne-etoiles">
            <span>Goût</span>
            <Etoiles valeur={saisie(p.id).gout} changer={(v) => maj(p.id, { gout: v })} libelle={`Goût pour ${p.nom}`} />
          </div>
          <label className="champ">
            Commentaire
            <textarea rows={2} value={saisie(p.id).commentaire} onChange={(e) => maj(p.id, { commentaire: e.target.value })} />
          </label>
        </fieldset>
      ))}
      {erreur && (
        <p className="texte-alerte" role="alert">
          {erreur}
        </p>
      )}
      <div className="actions">
        <button type="button" className="bouton" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
        <button type="button" className="bouton-secondaire" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export function SectionNotes({ recetteId }: { recetteId: string }) {
  const notes = useLiveQuery(() => notesDeRecette(recetteId), [recetteId]);
  const reglages = useReglages();
  const [noter, setNoter] = useState(false);
  if (notes === undefined) return null;
  const nom = (id: string) => reglages.personnes.find((p) => p.id === id)?.nom ?? id;
  const resume = resumerNotes(notes).get(recetteId);
  const historique = [...notes].sort((a: Note, b: Note) => b.date.localeCompare(a.date));

  return (
    <section className="carte">
      <div className="titre-avec-action">
        <h2>Notes</h2>
        {!noter && (
          <button type="button" className="bouton" onClick={() => setNoter(true)}>
            Noter
          </button>
        )}
      </div>
      {noter && <Formulaire recetteId={recetteId} fermer={() => setNoter(false)} />}
      {!resume ? (
        !noter && <p className="discret">Pas encore notée.</p>
      ) : (
        <>
          <table className="tableau-notes">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Facilité</th>
                <th scope="col">Goût</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Moyenne ({resume.nb})</th>
                <td>
                  <EtoilesLecture valeur={resume.facilite} /> {formaterMoyenne(resume.facilite)}
                </td>
                <td>
                  <EtoilesLecture valeur={resume.gout} /> {formaterMoyenne(resume.gout)}
                </td>
              </tr>
              {Object.entries(resume.parPersonne).map(([id, m]) => (
                <tr key={id}>
                  <th scope="row">
                    {nom(id)} ({m.nb})
                  </th>
                  <td>{formaterMoyenne(m.facilite)}</td>
                  <td>{formaterMoyenne(m.gout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Historique</h3>
          <ul className="historique-notes">
            {historique.map((n) => (
              <li key={n.id}>
                <div>
                  <strong>{dateLongue(n.date)}</strong> · {nom(n.personneId)} · facilité {n.facilite ?? '–'}/5 · goût {n.gout ?? '–'}/5
                  {n.commentaire && <p className="commentaire-note">« {n.commentaire} »</p>}
                </div>
                <button
                  type="button"
                  className="bouton-lien"
                  aria-label={`Supprimer la note de ${nom(n.personneId)} du ${dateLongue(n.date)}`}
                  onClick={() => confirm('Supprimer cette note ?') && void supprimerNote(n.id)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
