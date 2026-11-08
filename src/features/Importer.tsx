// Import d'un plan JSON : fichier ou texte collé, vérification, aperçu, puis enregistrement.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlanActif, useReglages } from '../app/hooks';
import { importerPlan, type BilanImport } from '../data/depot';
import { moisLong } from '../domain/dates';
import { alertesExclusions } from '../domain/exclusions';
import { validerPlan, type ResultatValidation } from '../domain/schema/validation';

export function Importer() {
  const [texte, setTexte] = useState('');
  const [resultat, setResultat] = useState<ResultatValidation | null>(null);
  const [bilan, setBilan] = useState<BilanImport | null>(null);
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string | null>(null);
  const reglages = useReglages();
  const { choisir } = usePlanActif();

  const verifier = (contenu: string) => {
    setTexte(contenu);
    setBilan(null);
    setResultat(validerPlan(contenu));
  };

  const lireFichier = async (f: File | undefined) => {
    if (f) verifier(await f.text());
  };

  const chargerExemple = async () => {
    const m = await import('../../fixtures/novembre-2026-semaine1.json');
    verifier(JSON.stringify(m.default, null, 2));
  };

  const enregistrer = async () => {
    if (!resultat?.ok) return;
    try {
      const b = await importerPlan(resultat.plan);
      choisir(b.mois);
      setBilan(b);
      setErreurEnregistrement(null);
    } catch (e) {
      setErreurEnregistrement((e as Error).message);
    }
  };

  const exclusions = resultat?.ok ? alertesExclusions(resultat.plan, reglages.personnes) : [];

  return (
    <>
      <header className="entete">
        <h1>Importer un plan</h1>
        <p className="discret">
          Fichier JSON produit par Claude selon SCHEMA.md. Le plan d’un mois déjà importé est remplacé ; les cases cochées et
          les réglages sont conservés.
        </p>
      </header>

      <section className="carte">
        <label className="champ">
          Choisir un fichier
          <input type="file" accept="application/json,.json" onChange={(e) => void lireFichier(e.target.files?.[0])} />
        </label>
        <label className="champ">
          … ou coller le JSON
          <textarea rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} spellCheck={false} />
        </label>
        <div className="actions">
          <button type="button" className="bouton" onClick={() => verifier(texte)} disabled={!texte.trim()}>
            Vérifier
          </button>
          <button type="button" className="bouton-secondaire" onClick={() => void chargerExemple()}>
            Charger l’exemple (novembre, semaine 1)
          </button>
        </div>
      </section>

      {resultat && !resultat.ok && (
        <section className="carte alerte" role="alert">
          <h2>{resultat.erreurs.length} erreur(s) : le plan n’est pas importé</h2>
          <ul className="erreurs">
            {resultat.erreurs.map((e, i) => (
              <li key={i}>
                <code>{e.chemin}</code> : {e.message}
              </li>
            ))}
          </ul>
          <p className="discret">Astuce : renvoyez ces messages à Claude pour qu’il corrige le fichier.</p>
        </section>
      )}

      {resultat?.ok && !bilan && (
        <section className="carte">
          <h2>Plan valide</h2>
          <p>
            <strong>{resultat.plan.titre}</strong> ({moisLong(resultat.plan.mois)}) : {resultat.plan.semaines.length} semaine(s),{' '}
            {resultat.plan.recettes.length} recette(s), {resultat.plan.ingredients.length} ingrédient(s).
          </p>
          {resultat.avertissements.length > 0 && (
            <>
              <h3>À vérifier ({resultat.avertissements.length})</h3>
              <ul className="erreurs">
                {resultat.avertissements.map((a, i) => (
                  <li key={i}>
                    <code>{a.chemin}</code> : {a.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          {exclusions.length > 0 && (
            <>
              <h3>Aliments exclus</h3>
              <ul className="erreurs">
                {exclusions.map((a, i) => (
                  <li key={i}>
                    Semaine {a.semaine}, {a.recette} : {a.ingredient} ({a.personne})
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="bouton bouton-large" onClick={() => void enregistrer()}>
            Importer ce plan
          </button>
          {erreurEnregistrement && <p className="texte-alerte">Échec de l’enregistrement : {erreurEnregistrement}</p>}
        </section>
      )}

      {bilan && (
        <section className="carte succes" role="status">
          <h2>Plan de {moisLong(bilan.mois)} importé</h2>
          <p>
            {bilan.remplace ? 'Il remplace le plan précédent du même mois. ' : ''}
            {bilan.recettes} recette(s) ajoutée(s) ou mise(s) à jour dans la bibliothèque.
            {bilan.personnesAjoutees.length > 0 &&
              ` Personnes ajoutées aux réglages : ${bilan.personnesAjoutees.join(', ')} (renseignez leurs aliments exclus).`}
          </p>
          <Link className="bouton" to="/">
            Voir le plan
          </Link>
        </section>
      )}
    </>
  );
}
