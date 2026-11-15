// « Compléter la nutrition » : pour chaque ingrédient du plan affiché, l'app PROPOSE des aliments
// Ciqual (d'après le nom) et le marquage « féculent » (d'après le sous-groupe Ciqual) ; rien n'est
// enregistré sans que la personne ait choisi. La masse d'une unité n'est jamais proposée.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCiqual, usePlanActif } from '../app/hooks';
import { enregistrerInfosIngredient } from '../data/depot';
import { LIBELLES_UNITE, type Unite } from '../domain/constantes';
import { chercherAliments, proposerAliments, raisonFeculent, type TableCiqual } from '../domain/nutrition';
import type { Ingredient, Plan } from '../domain/schema/plan';
import { familleDe } from '../domain/unites';
import { AucunPlan, EnChargement } from '../ui/composants';

/** Choix en cours pour un ingrédient (absent = pas touché). */
type Choix = { code?: string | null; feculent?: boolean; feculentPropose?: string; masses?: Partial<Record<Unite, string>> };

type Usage = { ingredient: Ingredient; recettes: string[]; unites: Unite[] };

/** Ingrédients cités par les recettes du plan, avec les recettes et les unités non massiques employées. */
function usages(plan: Plan): Usage[] {
  const parId = new Map<string, Usage>();
  const catalogue = new Map(plan.ingredients.map((i) => [i.id, i]));
  for (const r of plan.recettes) {
    for (const l of r.ingredients) {
      const ing = catalogue.get(l.ingredient);
      if (!ing) continue;
      const u = parId.get(ing.id) ?? { ingredient: ing, recettes: [], unites: [] };
      if (!u.recettes.includes(r.nom)) u.recettes.push(r.nom);
      if (familleDe(l.unite) !== 'masse' && !u.unites.includes(l.unite)) u.unites.push(l.unite);
      parId.set(ing.id, u);
    }
  }
  return [...parId.values()].sort((a, b) => b.recettes.length - a.recettes.length || a.ingredient.nom.localeCompare(b.ingredient.nom, 'fr'));
}

const singulier = (u: Unite) => LIBELLES_UNITE[u].replace('(s)', '');

function LigneIngredient({ usage, table, choix, maj }: { usage: Usage; table: TableCiqual; choix: Choix; maj: (c: Choix) => void }) {
  const { ingredient: ing, recettes, unites } = usage;
  const [recherche, setRecherche] = useState<string | null>(null);
  const actuel = ing.ciqual?.code ?? null;
  const code = choix.code !== undefined ? choix.code : actuel;
  const propositions = proposerAliments(table, ing.nom, 4).map((p) => p.aliment);
  const choisi = code ? table.aliments.get(code) : undefined;
  // L'aliment choisi reste visible même s'il n'est pas parmi les propositions.
  const options = choisi && !propositions.some((a) => a.code === choisi.code) ? [choisi, ...propositions] : propositions;
  const feculent = choix.feculent ?? !!ing.feculent;
  const nomGroupe = `ciqual-${ing.id}`;

  const choisir = (nouveau: string | null) => {
    const a = nouveau ? table.aliments.get(nouveau) : undefined;
    const raison = a ? raisonFeculent(a) : null;
    // « Féculent » est proposé (case cochée) seulement si la personne n'y a pas encore touché.
    const toucheFeculent = choix.feculent !== undefined && !choix.feculentPropose;
    maj({
      ...choix,
      code: nouveau,
      ...(toucheFeculent ? {} : raison ? { feculent: true, feculentPropose: raison } : { feculent: undefined, feculentPropose: undefined }),
    });
  };

  return (
    <li className="carte ligne-completer">
      <fieldset className="choix">
        <legend>
          <strong>{ing.nom}</strong>
        </legend>
        <p className="discret petit">
          {recettes.length} recette{recettes.length > 1 ? 's' : ''} : {recettes.join(', ')}
        </p>
        <div role="radiogroup" aria-label={`Aliment Ciqual pour ${ing.nom}`} className="propositions">
          {options.map((a) => (
            <label key={a.code} className="proposition">
              <input type="radio" name={nomGroupe} checked={code === a.code} onChange={() => choisir(a.code)} />
              <span>
                {a.nom} <span className="discret">({table.sousGroupes[a.sousGroupe] ?? a.sousGroupe})</span>
              </span>
            </label>
          ))}
          <label className="proposition">
            <input type="radio" name={nomGroupe} checked={code === null} onChange={() => choisir(null)} />
            <span className="discret">Aucun (non compté dans la nutrition)</span>
          </label>
        </div>
        {options.length === 0 && <p className="discret petit">Aucune proposition d’après le nom.</p>}
        {recherche === null ? (
          <button type="button" className="bouton-lien" onClick={() => setRecherche('')}>
            Autre aliment…
          </button>
        ) : (
          <div>
            <label className="champ">
              Chercher dans Ciqual
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. fromage frais nature" autoFocus />
            </label>
            {recherche.trim().length >= 2 && (
              <ul className="liste-choix" aria-label={`Résultats pour ${ing.nom}`}>
                {chercherAliments(table, recherche, 10).map((a) => (
                  <li key={a.code}>
                    <button
                      type="button"
                      className="bouton-secondaire"
                      onClick={() => {
                        choisir(a.code);
                        setRecherche(null);
                      }}
                    >
                      {a.nom} <span className="discret">({table.sousGroupes[a.sousGroupe] ?? a.sousGroupe})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <label className="interrupteur">
          <input type="checkbox" checked={feculent} onChange={(e) => maj({ ...choix, feculent: e.target.checked, feculentPropose: undefined })} /> Féculent
          {choix.feculentPropose && feculent && <span className="discret petit"> — proposé car : {choix.feculentPropose} (Ciqual)</span>}
        </label>
        {unites.map((u) => (
          <label className="champ champ-nombre" key={u}>
            Masse d’une unité « {singulier(u)} » (g)
            <input
              inputMode="decimal"
              placeholder={ing.masseParUnite?.[u] !== undefined ? String(ing.masseParUnite[u]).replace('.', ',') : 'à peser'}
              value={choix.masses?.[u] ?? ''}
              onChange={(e) => maj({ ...choix, masses: { ...choix.masses, [u]: e.target.value } })}
            />
          </label>
        ))}
      </fieldset>
    </li>
  );
}

export function CompleterNutrition() {
  const { plan } = usePlanActif();
  const table = useCiqual();
  const [choix, setChoix] = useState<Record<string, Choix>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  if (plan === undefined || table === undefined) return <EnChargement />;
  if (plan === null) return <AucunPlan />;
  if (table instanceof Error) return <p className="texte-alerte">{table.message}</p>;

  const liste = usages(plan);
  const sansCode = liste.filter((u) => !u.ingredient.ciqual);
  const avecCode = liste.filter((u) => u.ingredient.ciqual);
  const modifies = Object.keys(choix).length;

  const enregistrer = async () => {
    setErreur(null);
    let n = 0;
    for (const [id, c] of Object.entries(choix)) {
      const ing = plan.ingredients.find((i) => i.id === id);
      if (!ing) continue;
      const masseParUnite: Partial<Record<Unite, number>> = {};
      for (const [u, t] of Object.entries(c.masses ?? {})) {
        if (!t?.trim()) continue;
        const v = Number(t.trim().replace(',', '.'));
        if (!Number.isFinite(v) || v <= 0) return setErreur(`${ing.nom} : masse d’une unité « ${singulier(u as Unite)} » attendue en grammes, supérieure à 0.`);
        masseParUnite[u as Unite] = v;
      }
      const changeCode = c.code !== undefined && c.code !== (ing.ciqual?.code ?? null);
      const changeFeculent = c.feculent !== undefined && c.feculent !== !!ing.feculent;
      if (!changeCode && !changeFeculent && !Object.keys(masseParUnite).length) continue;
      await enregistrerInfosIngredient({
        id,
        ...(changeCode ? { ciqual: c.code } : {}),
        ...(changeFeculent ? { feculent: c.feculent } : {}),
        ...(Object.keys(masseParUnite).length ? { masseParUnite } : {}),
      });
      n++;
    }
    setChoix({});
    setMessage(n ? `${n} ingrédient${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} pour tous les mois.` : 'Aucun changement à enregistrer.');
  };

  const ligne = (u: Usage) => (
    <LigneIngredient
      key={u.ingredient.id}
      usage={u}
      table={table}
      choix={choix[u.ingredient.id] ?? {}}
      maj={(c) => {
        setMessage(null);
        setChoix({ ...choix, [u.ingredient.id]: c });
      }}
    />
  );

  return (
    <>
      <header className="entete">
        <Link to="/recettes" className="discret">
          ‹ Recettes
        </Link>
        <h1>Compléter la nutrition</h1>
        <p className="discret">
          Ingrédients des recettes du plan affiché. L’app propose des aliments Ciqual d’après le nom et « féculent » d’après le
          groupe Ciqual : rien n’est enregistré sans votre choix. Choisissez l’état dans lequel la quantité est écrite (cru, sec,
          cuit, égoutté…). La masse d’une pièce ou d’une cuillère n’est jamais proposée : pesez-la une fois.
        </p>
      </header>

      <h2>Sans aliment Ciqual ({sansCode.length})</h2>
      {sansCode.length === 0 ? <p className="discret">Tous les ingrédients des recettes ont un aliment Ciqual.</p> : <ul className="liste-completer">{sansCode.map(ligne)}</ul>}

      <details className="details-nutrition">
        <summary>Avec un aliment Ciqual, à vérifier ({avecCode.length})</summary>
        <ul className="liste-completer">{avecCode.map(ligne)}</ul>
      </details>

      <div className="barre-enregistrer">
        {erreur && (
          <p className="texte-alerte" role="alert">
            {erreur}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button type="button" className="bouton" disabled={modifies === 0} onClick={() => void enregistrer()}>
          Enregistrer les choix{modifies ? ` (${modifies})` : ''}
        </button>
      </div>
    </>
  );
}
