// « Compléter la nutrition » : tout ce qui empêche de compter un ingrédient du plan affiché.
// L'app PROPOSE (aliments Ciqual d'après le nom, « féculent » d'après le groupe Ciqual, masses
// moyennes d'unité d'après l'USDA) ; rien n'est enregistré sans que la personne ait choisi.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCiqual, usePlanActif, usePortionsUsda } from '../app/hooks';
import { enregistrerInfosIngredient } from '../data/depot';
import { LIBELLES_UNITE, type Unite } from '../domain/constantes';
import { ingredientsNegliges } from '../domain/modifications';
import {
  aCompleter,
  chercherAliments,
  manquesDuPlan,
  proposerAliments,
  raisonFeculent,
  type ManquesIngredient,
  type TableCiqual,
} from '../domain/nutrition';
import { proposerMasses, type FichierPortions } from '../domain/portions-usda';
import type { Plan } from '../domain/schema/plan';
import { AucunPlan, EnChargement } from '../ui/composants';

/** Choix en cours pour un ingrédient (absent = pas touché). */
type Choix = {
  code?: string | null;
  feculent?: boolean;
  feculentPropose?: string;
  masses?: Partial<Record<Unite, string>>;
  negligeable?: boolean;
};

const singulier = (u: Unite) => LIBELLES_UNITE[u].replace('(s)', '');
const nf = (g: number) => g.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Semaine où la recette est cuisinée (pour ouvrir sa fiche dans le bon contexte). */
const semaineDe = (plan: Plan, recetteId: string) => plan.semaines.find((s) => s.plats.some((p) => p.recette === recetteId))?.numero;

function CarteIngredient({
  m,
  plan,
  table,
  portions,
  choix,
  maj,
}: {
  m: ManquesIngredient;
  plan: Plan;
  table: TableCiqual;
  portions: FichierPortions | null;
  choix: Choix;
  maj: (c: Choix) => void;
}) {
  const ing = m.ingredient;
  const [recherche, setRecherche] = useState<string | null>(null);
  const actuel = ing.ciqual?.code ?? null;
  const code = choix.code !== undefined ? choix.code : actuel;
  const choisi = code ? table.aliments.get(code) : undefined;
  const propositions = proposerAliments(table, ing.nom, 4).map((p) => p.aliment);
  const options = choisi && !propositions.some((a) => a.code === choisi.code) ? [choisi, ...propositions] : propositions;
  const feculent = choix.feculent ?? !!ing.feculent;
  const negligeable = choix.negligeable ?? m.negligeable;
  const nomGroupe = `ciqual-${ing.id}`;
  const manque = [
    m.sansCode && 'aliment Ciqual',
    m.codeInconnu && 'aliment absent de la table 2025',
    ...m.massesManquantes.map((u) => `masse « ${singulier(u)} »`),
    m.quantitesNonPrecisees.length > 0 && 'quantité non précisée',
  ].filter(Boolean) as string[];

  const choisir = (nouveau: string | null) => {
    const a = nouveau ? table.aliments.get(nouveau) : undefined;
    const raison = a ? raisonFeculent(a) : null;
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
        {manque.length > 0 && !m.negligeable && <p className="petit texte-alerte">Manque : {manque.join(' ; ')}</p>}
        <p className="discret petit">
          {m.recettes.length} recette{m.recettes.length > 1 ? 's' : ''} : {m.recettes.join(', ')}
        </p>

        <label className="interrupteur">
          <input type="checkbox" checked={negligeable} onChange={(e) => maj({ ...choix, negligeable: e.target.checked })} /> Quantité négligeable, ne pas
          compter
        </label>

        {!negligeable && (
          <>
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

            {m.unites.map((u) => {
              const connue = ing.masseParUnite?.[u];
              const proposees = proposerMasses(portions, code ?? undefined, u);
              const usda = code ? portions?.aliments[code] : undefined;
              return (
                <div key={u} className="masse-unite">
                  <label className="champ champ-nombre">
                    Masse d’une unité « {singulier(u)} » (g){connue !== undefined && <span className="discret"> — actuelle : {nf(connue)} g</span>}
                    <input
                      inputMode="decimal"
                      placeholder={connue !== undefined ? nf(connue) : 'à peser'}
                      value={choix.masses?.[u] ?? ''}
                      onChange={(e) => maj({ ...choix, masses: { ...choix.masses, [u]: e.target.value } })}
                    />
                  </label>
                  {proposees.length > 0 && (
                    <div className="masses-proposees" aria-label={`Masses moyennes proposées pour « ${singulier(u)} »`}>
                      <span className="discret petit">
                        Masses moyennes USDA ({usda?.description}
                        {usda?.note ? ` ; ${usda.note}` : ''}) :
                      </span>
                      {proposees.map((p) => (
                        <button
                          key={p.libelle}
                          type="button"
                          className="bouton-secondaire bouton-petit"
                          aria-label={`${nf(p.g)} g (${p.libelle})`}
                          onClick={() => maj({ ...choix, masses: { ...choix.masses, [u]: String(p.g).replace('.', ',') } })}
                        >
                          {nf(p.g)} g <span className="discret">· {p.libelle}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {m.quantitesNonPrecisees.length > 0 && (
              <p className="petit">
                Quantité non précisée dans :{' '}
                {m.quantitesNonPrecisees.map((q, i) => {
                  const n = semaineDe(plan, q.recetteId);
                  return (
                    <span key={q.recetteId + i}>
                      {i > 0 && ', '}
                      <Link to={`/recettes/${q.recetteId}${n ? `?semaine=${n}` : ''}`}>{q.recette}</Link>
                    </span>
                  );
                })}{' '}
                (à corriger avec « Modifier les ingrédients »).
              </p>
            )}
          </>
        )}
      </fieldset>
    </li>
  );
}

export function CompleterNutrition() {
  const { plan, infos } = usePlanActif();
  const table = useCiqual();
  const portions = usePortionsUsda();
  const [choix, setChoix] = useState<Record<string, Choix>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  if (plan === undefined || table === undefined) return <EnChargement />;
  if (plan === null) return <AucunPlan />;
  if (table instanceof Error) return <p className="texte-alerte">{table.message}</p>;

  const liste = manquesDuPlan(plan, table, ingredientsNegliges(infos));
  const aliments = liste.filter((m) => !m.negligeable && (m.sansCode || m.codeInconnu || m.massesManquantes.length > 0));
  const quantites = liste.filter((m) => !m.negligeable && !aliments.includes(m) && m.quantitesNonPrecisees.length > 0);
  const complets = liste.filter((m) => !aCompleter(m));
  const modifies = Object.keys(choix).length;

  const enregistrer = async () => {
    setErreur(null);
    let n = 0;
    for (const [id, c] of Object.entries(choix)) {
      const m = liste.find((x) => x.ingredient.id === id);
      if (!m) continue;
      const ing = m.ingredient;
      const masseParUnite: Partial<Record<Unite, number>> = {};
      for (const [u, t] of Object.entries(c.masses ?? {})) {
        if (!t?.trim()) continue;
        const v = Number(t.trim().replace(',', '.'));
        if (!Number.isFinite(v) || v <= 0) return setErreur(`${ing.nom} : masse d’une unité « ${singulier(u as Unite)} » attendue en grammes, supérieure à 0.`);
        masseParUnite[u as Unite] = v;
      }
      const changeCode = c.code !== undefined && c.code !== (ing.ciqual?.code ?? null);
      const changeFeculent = c.feculent !== undefined && c.feculent !== !!ing.feculent;
      const changeNeglige = c.negligeable !== undefined && c.negligeable !== m.negligeable;
      if (!changeCode && !changeFeculent && !changeNeglige && !Object.keys(masseParUnite).length) continue;
      await enregistrerInfosIngredient({
        id,
        ...(changeCode ? { ciqual: c.code } : {}),
        ...(changeFeculent ? { feculent: c.feculent } : {}),
        ...(changeNeglige ? { negligeable: c.negligeable } : {}),
        ...(Object.keys(masseParUnite).length ? { masseParUnite } : {}),
      });
      n++;
    }
    setChoix({});
    setMessage(n ? `${n} ingrédient${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} pour tous les mois.` : 'Aucun changement à enregistrer.');
  };

  const carte = (m: ManquesIngredient) => (
    <CarteIngredient
      key={m.ingredient.id}
      m={m}
      plan={plan}
      table={table}
      portions={portions}
      choix={choix[m.ingredient.id] ?? {}}
      maj={(c) => {
        setMessage(null);
        setChoix({ ...choix, [m.ingredient.id]: c });
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
          Ingrédients des recettes du plan affiché. L’app propose des aliments Ciqual d’après le nom, « féculent » d’après le
          groupe Ciqual et des masses moyennes d’unité d’après l’USDA : rien n’est enregistré sans votre choix. Choisissez
          l’aliment dans l’état où la quantité est écrite (cru, sec, cuit…) ; une pesée vaut mieux qu’une masse moyenne.
        </p>
      </header>

      <h2>Aliment ou masse à compléter ({aliments.length})</h2>
      {aliments.length === 0 ? <p className="discret">Rien à compléter ici.</p> : <ul className="liste-completer">{aliments.map(carte)}</ul>}

      <h2>Quantités non précisées ({quantites.length})</h2>
      <p className="discret petit">
        La recette ne dit pas combien en mettre : corrigez la quantité dans la fiche, ou cochez « négligeable » pour une
        pincée d’épices ou quelques herbes.
      </p>
      {quantites.length === 0 ? <p className="discret">Aucune.</p> : <ul className="liste-completer">{quantites.map(carte)}</ul>}

      <details className="details-nutrition">
        <summary>Complets ou non comptés par choix ({complets.length})</summary>
        <ul className="liste-completer">{complets.map(carte)}</ul>
      </details>

      <p className="discret petit">
        Masses moyennes :{' '}
        <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">
          USDA FoodData Central, SR Legacy
        </a>{' '}
        (domaine public), aliments américains, partie comestible ; 1 cuillère à soupe américaine = 14,8 ml.
      </p>

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
