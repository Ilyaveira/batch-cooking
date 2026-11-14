// Affichage de la nutrition calculée (Ciqual 2025) : par portion et par personne sur la fiche
// recette, total par jour et par personne dans « quand manger quoi », comparés aux objectifs.
import { useState } from 'react';
import { useCiqual, useReglages } from '../app/hooks';
import type { PersonneReglages, Reglages } from '../domain/reglages';
import {
  etiquettesNutrition,
  etiquettesObtenues,
  formaterIntervalle,
  LIBELLES_MANQUE,
  LIBELLES_NUTRIMENT,
  NUTRIMENTS,
  nutritionRecette,
  partEnergie,
  positionObjectif,
  type Bilan,
  type Intervalle,
  type JourNutrition,
  type PositionObjectif,
  type TableCiqual,
} from '../domain/nutrition';
import type { Ingredient, Recette } from '../domain/schema/plan';
import { EditeurIngredient } from './EditeurIngredient';

const PRECISIONS = { inferieure: 'inférieure à une limite', traces: 'traces', absente: 'absente de la table' } as const;

export function SourceCiqual({ table }: { table: TableCiqual }) {
  return (
    <p className="discret petit">
      Calcul : <a href={table.source.url} target="_blank" rel="noreferrer">{table.source.libelle}</a>, publiée le 19/11/2025,{' '}
      <a href={table.source.licenceUrl} target="_blank" rel="noreferrer">
        {table.source.licence}
      </a>
      . Quantités telles qu’écrites dans la recette ; le code Ciqual de chaque ingrédient doit correspondre à cet état (cru, sec, cuit…).
    </p>
  );
}

const LIBELLES_POSITION: Record<PositionObjectif, string> = {
  sous: 'sous l’objectif',
  dans: 'dans l’objectif',
  'au-dessus': 'au-dessus',
  indetermine: 'incertain',
  'sans-objectif': '',
};

export function PastilleObjectif({ position }: { position: PositionObjectif }) {
  if (position === 'sans-objectif') return null;
  return <span className={`objectif objectif-${position}`}>{LIBELLES_POSITION[position]}</span>;
}

const plage = (min?: number, max?: number, unite = '') =>
  min !== undefined && max !== undefined ? `${min}–${max} ${unite}` : min !== undefined ? `≥ ${min} ${unite}` : max !== undefined ? `≤ ${max} ${unite}` : '';

/** « 24 à 26 % de l'objectif (1650–1750 kcal) » : part d'une portion dans l'objectif journalier. */
function partObjectif(x: Intervalle, min?: number, max?: number, unite = ''): string | null {
  if (min === undefined && max === undefined) return null;
  const bas = max ? (x.min / max) * 100 : null;
  const haut = min && x.max !== null ? (x.max / min) * 100 : null;
  const f = (v: number) => Math.round(v);
  const texte = bas !== null && haut !== null ? (f(bas) === f(haut) ? `${f(bas)} %` : `${f(bas)} à ${f(haut)} %`) : bas !== null ? `≥ ${f(bas)} %` : `≤ ${f(haut!)} %`;
  return `${texte} de l’objectif du jour (${plage(min, max, unite).trim()})`;
}

export const coefDe = (reglages: Reglages, id: string) => reglages.personnes.find((p) => p.id === id)?.coefFeculents ?? 1;

/** Section « Nutrition » de la fiche recette. */
export function SectionNutrition({ recette, catalogue, mangeurs }: { recette: Recette; catalogue: Ingredient[]; mangeurs: string[] }) {
  const table = useCiqual();
  const reglages = useReglages();
  const [edition, setEdition] = useState<string | null>(null);
  if (table === undefined)
    return (
      <section className="carte">
        <h2>Nutrition</h2>
        <p className="discret">Chargement de la table Ciqual…</p>
      </section>
    );
  if (table instanceof Error)
    return (
      <section className="carte">
        <h2>Nutrition</h2>
        <p className="texte-alerte">{table.message}</p>
      </section>
    );
  const parId = new Map(catalogue.map((i) => [i.id, i]));
  const personnes = mangeurs.map((id) => reglages.personnes.find((p) => p.id === id) ?? ({ id, nom: id, exclusions: [] } as PersonneReglages));
  const n = nutritionRecette(recette, parId, table, personnes.map((p) => ({ id: p.id, coefFeculents: coefDe(reglages, p.id) })));
  const etiquettes = etiquettesNutrition(n.total, reglages.nutrition.seuilGlucidesPct);
  const obtenues = etiquettesObtenues(etiquettes);
  const manques = [...new Map(n.total.manques.map((m) => [`${m.ingredient}|${m.raison}`, m])).values()];
  const approx = [...new Map(n.total.approximations.map((a) => [`${a.ingredient}|${a.nutriment}`, a])).values()];
  // Une colonne par personne quand les portions peuvent différer ; sinon la portion moyenne.
  const parPersonne = personnes.length > 1 || personnes.some((p) => coefDe(reglages, p.id) !== 1);
  const colonnes: { cle: string; titre: string; bilan: Bilan; personne?: PersonneReglages }[] = parPersonne
    ? personnes.map((p) => ({ cle: p.id, titre: p.nom, bilan: n.parPersonne.get(p.id)!, personne: p }))
    : [{ cle: 'moyenne', titre: personnes.length === 1 ? personnes[0]!.nom : 'Portion', bilan: n.portion, ...(personnes[0] ? { personne: personnes[0] } : {}) }];


  return (
    <section className="carte" aria-labelledby="titre-nutrition">
      <h2 id="titre-nutrition">Nutrition par portion</h2>
      {obtenues.length > 0 && (
        <p className="etiquettes">
          {obtenues.map((e) => (
            <span key={e.cle} className="etiquette etiquette-nutrition" title={e.regle}>
              {e.libelle}
            </span>
          ))}
        </p>
      )}
      {!n.total.complet && (
        <p className="bandeau-info" role="note">
          Calcul incomplet : {manques.length} ingrédient{manques.length > 1 ? 's' : ''} non compté{manques.length > 1 ? 's' : ''}. Les
          valeurs sont des minimums (« ≥ »).
        </p>
      )}
      <div className="tableau-defilant">
        <table className="tableau-nutrition">
          <thead>
            <tr>
              <th scope="col">Par portion</th>
              {colonnes.map((c) => (
                <th key={c.cle} scope="col">
                  {c.titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NUTRIMENTS.map((k) => (
              <tr key={k}>
                <th scope="row" className={k === 'sucres' || k === 'ags' ? 'sous-ligne' : ''}>
                  {LIBELLES_NUTRIMENT[k].libelle} <span className="discret">({LIBELLES_NUTRIMENT[k].unite})</span>
                </th>
                {colonnes.map((c) => (
                  <td key={c.cle}>{formaterIntervalle(c.bilan.valeurs[k], k)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {colonnes.some((c) => c.personne?.objectifs) && (
        <ul className="liste-simple petit">
          {colonnes
            .filter((c) => c.personne?.objectifs)
            .map((c) => {
              const o = c.personne!.objectifs!;
              const kcal = partObjectif(c.bilan.valeurs.kcal, o.kcalMin, o.kcalMax, 'kcal');
              const prot = partObjectif(c.bilan.valeurs.proteines, o.proteinesMin, o.proteinesMax, 'g');
              return (
                <li key={c.cle}>
                  <strong>{c.titre}</strong> : {[kcal && `énergie ${kcal}`, prot && `protéines ${prot}`].filter(Boolean).join(' ; ')}
                </li>
              );
            })}
        </ul>
      )}
      {n.total.valeurs.kcal.max !== null && (
      <p className="discret petit">
        Part de l’énergie — protéines : {formaterIntervalle(versIntervalle(partEnergie(n.total, 'proteines')), 'pct')} % · glucides : {formaterIntervalle(versIntervalle(partEnergie(n.total, 'glucides')), 'pct')} % · lipides :{' '}
        {formaterIntervalle(versIntervalle(partEnergie(n.total, 'lipides')), 'pct')} %.
      </p>
      )}
      {parPersonne && (
        <p className="discret petit">
          {n.feculents.length
            ? `Chacun a la même part de tout, sauf les féculents (${n.feculents.join(', ')}) répartis selon les coefficients des Réglages. Portion moyenne : ${formaterIntervalle(n.portion.valeurs.kcal, 'kcal')} kcal.`
            : 'Aucun ingrédient n’est marqué « féculent » : les portions sont identiques. Le marquage se fait sur l’ingrédient (✎).'}
        </p>
      )}

      {manques.length > 0 && (
        <details className="details-nutrition" open>
          <summary>Non comptés ({manques.length})</summary>
          <ul className="liste-simple">
            {manques.map((m) => (
              <li key={`${m.ingredient}|${m.raison}`}>
                <div className="ligne-manque">
                  <span>
                    {m.nom} : {LIBELLES_MANQUE[m.raison]}
                    {m.unite && ` (${m.unite})`}
                  </span>
                  {parId.get(m.ingredient) && m.raison !== 'quantite' && (
                    <button type="button" className="bouton-secondaire" aria-label={`Compléter ${m.nom}`} onClick={() => setEdition(edition === m.ingredient ? null : m.ingredient)}>
                      ✎
                    </button>
                  )}
                </div>
                {edition === m.ingredient && <EditeurIngredient ingredient={parId.get(m.ingredient)!} fermer={() => setEdition(null)} />}
              </li>
            ))}
          </ul>
          <p className="discret petit">
            Quantité non précisée : à corriger dans « Modifier les ingrédients ». Masse d’une unité : pesez-la une fois (ex. un œuf, une
            cuillère d’huile), elle est mémorisée pour tous les mois.
          </p>
        </details>
      )}
      {n.total.facultatifsIgnores.length > 0 && <p className="discret petit">Ingrédients facultatifs non comptés : {[...new Set(n.total.facultatifsIgnores)].join(', ')}.</p>}
      {approx.length > 0 && (
        <details className="details-nutrition">
          <summary>Valeurs incertaines dans Ciqual ({approx.length})</summary>
          <ul className="liste-simple petit">
            {approx.map((a) => (
              <li key={`${a.ingredient}|${a.nutriment}`}>
                {a.nom} — {LIBELLES_NUTRIMENT[a.nutriment].libelle.toLowerCase()} : {PRECISIONS[a.precision]}
                {a.precision === 'inferieure' && ` (< ${String(a.valeur).slice(1).replace('.', ',')} g/100 g)`}
              </li>
            ))}
          </ul>
          <p className="discret petit">Comptées comme un intervalle (au moins 0, au plus la limite ou inconnu), jamais remplacées par un chiffre.</p>
        </details>
      )}
      <details className="details-nutrition">
        <summary>Étiquettes calculées</summary>
        <ul className="liste-simple petit">
          {etiquettes.map((e) => (
            <li key={e.cle}>
              <strong>{e.libelle}</strong> : {e.statut === 'oui' ? 'oui' : e.statut === 'non' ? 'non' : `indéterminé — ${e.raison}`}
              <br />
              <span className="discret">
                Règle : {e.regle}.{' '}
                {e.source ? (
                  <a href={e.source.url} target="_blank" rel="noreferrer">
                    {e.source.libelle}
                  </a>
                ) : (
                  'Pas de définition réglementaire.'
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="discret petit">
          Ces conditions visent les produits vendus ; appliquées à une recette maison, elles sont indicatives. Les seuils « pour 100 g »
          se rapportent à la masse des ingrédients tels que pesés (souvent crus) : la masse après cuisson n’est pas connue. Énergie des
          macronutriments : protéines et glucides 4 kcal/g, lipides 9 kcal/g (règlement (UE) 1169/2011, annexe XIV).
        </p>
      </details>
      <SourceCiqual table={table} />
    </section>
  );
}

function versIntervalle(r: { bas: number; haut: number }): Intervalle {
  return { min: r.bas, max: Number.isFinite(r.haut) ? r.haut : null };
}

/** Totaux d'une journée par personne, comparés aux objectifs (dans « quand manger quoi »). */
export function TotauxJour({ jour, personnes }: { jour: JourNutrition | undefined; personnes: { id: string; nom: string }[] }) {
  const reglages = useReglages();
  if (!jour) return null;
  return (
    <div className="totaux-jour" aria-label="Apports du jour (repas du plan)">
      {personnes
        .filter((p) => jour.parPersonne.has(p.id))
        .map((p) => {
          const { bilan } = jour.parPersonne.get(p.id)!;
          const o = reglages.personnes.find((x) => x.id === p.id)?.objectifs ?? {};
          return (
            <p key={p.id} className="petit total-personne">
              <strong>{reglages.personnes.find((x) => x.id === p.id)?.nom ?? p.nom}</strong> : {formaterIntervalle(bilan.valeurs.kcal, 'kcal')} kcal{' '}
              <PastilleObjectif position={positionObjectif(bilan.valeurs.kcal, o.kcalMin, o.kcalMax)} /> ·{' '}
              {formaterIntervalle(bilan.valeurs.proteines, 'proteines')} g de protéines{' '}
              <PastilleObjectif position={positionObjectif(bilan.valeurs.proteines, o.proteinesMin, o.proteinesMax)} />
              {(o.kcalMin !== undefined || o.kcalMax !== undefined || o.proteinesMin !== undefined || o.proteinesMax !== undefined) && (
                <span className="discret">
                  {' '}
                  (objectif {[plage(o.kcalMin, o.kcalMax, 'kcal'), plage(o.proteinesMin, o.proteinesMax, 'g')].filter((x) => x.trim()).join(', ').trim()})
                </span>
              )}
            </p>
          );
        })}
    </div>
  );
}
