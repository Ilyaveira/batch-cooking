// Panneau « Modifier l'ingrédient » : nom, rayon, rangement, produit de placard, et pour la
// nutrition : aliment Ciqual, masse d'une unité (pièce, cuillère…), féculent.
// Mémorisé sur ce téléphone pour tous les mois (par identifiant d'ingrédient).
import { useState } from 'react';
import { useCiqual, usePlanActif } from '../app/hooks';
import { enregistrerInfosIngredient, oublierInfosIngredient } from '../data/depot';
import { LIBELLES_RAYON, LIBELLES_STOCKAGE, RAYONS, STOCKAGES, STOCKAGE_PAR_RAYON, type Rayon, type Stockage } from '../domain/constantes';
import { LIBELLES_UNITE, type Unite } from '../domain/constantes';
import { chercherAliments } from '../domain/nutrition';
import type { Ingredient } from '../domain/schema/plan';
import { familleDe } from '../domain/unites';

export function EditeurIngredient({ ingredient, fermer, rangementEnPremier }: { ingredient: Ingredient; fermer: () => void; rangementEnPremier?: boolean }) {
  const { infos, plan } = usePlanActif();
  const table = useCiqual();
  const [code, setCode] = useState<string | null>(ingredient.ciqual?.code ?? null);
  const [recherche, setRecherche] = useState('');
  const [feculent, setFeculent] = useState(!!ingredient.feculent);
  // Unités non massiques employées pour cet ingrédient dans le plan affiché (masse à saisir).
  const unites = [
    ...new Set<Unite>([
      ...((plan?.recettes ?? []).flatMap((r) => r.ingredients.filter((l) => l.ingredient === ingredient.id).map((l) => l.unite)) as Unite[]),
      ...(Object.keys(ingredient.masseParUnite ?? {}) as Unite[]),
    ]),
  ].filter((u) => familleDe(u) !== 'masse');
  const [masses, setMasses] = useState<Record<string, string>>(
    Object.fromEntries(unites.map((u) => [u, ingredient.masseParUnite?.[u] !== undefined ? String(ingredient.masseParUnite[u]).replace('.', ',') : ''])),
  );
  const [nom, setNom] = useState(ingredient.nom);
  const [rayon, setRayon] = useState<Rayon>(ingredient.rayon);
  const [stockage, setStockage] = useState<Stockage>(ingredient.stockage ?? STOCKAGE_PAR_RAYON[ingredient.rayon]);
  const [placard, setPlacard] = useState(!!ingredient.placard);
  const [erreur, setErreur] = useState<string | null>(null);
  const perso = infos.find((i) => i.id === ingredient.id);

  const enregistrer = async () => {
    if (!nom.trim()) return setErreur('Le nom ne peut pas être vide.');
    const masseParUnite: Partial<Record<Unite, number>> = {};
    for (const [u, t] of Object.entries(masses)) {
      if (!t.trim()) continue;
      const v = Number(t.trim().replace(',', '.'));
      if (!Number.isFinite(v) || v <= 0) return setErreur(`Masse d’une unité « ${LIBELLES_UNITE[u as Unite].replace('(s)', '')} » : nombre de grammes supérieur à 0 attendu.`);
      if (v !== ingredient.masseParUnite?.[u as Unite]) masseParUnite[u as Unite] = v;
    }
    await enregistrerInfosIngredient({
      id: ingredient.id,
      nom: nom.trim(),
      rayon,
      stockage,
      placard,
      ...(code !== (ingredient.ciqual?.code ?? null) ? { ciqual: code } : {}),
      ...(Object.keys(masseParUnite).length ? { masseParUnite } : {}),
      ...(feculent !== !!ingredient.feculent ? { feculent } : {}),
    });
    fermer();
  };

  const champRangement = (
    <label className="champ" key="rangement">
      Rangé à la maison
      <select value={stockage} onChange={(e) => setStockage(e.target.value as Stockage)}>
        {STOCKAGES.map((s) => (
          <option key={s} value={s}>
            {LIBELLES_STOCKAGE[s]}
          </option>
        ))}
      </select>
    </label>
  );
  const champs = [
    <label className="champ" key="nom">
      Nom
      <input value={nom} onChange={(e) => setNom(e.target.value)} />
    </label>,
    <label className="champ" key="rayon">
      Rayon du magasin
      <select value={rayon} onChange={(e) => setRayon(e.target.value as Rayon)}>
        {RAYONS.map((r) => (
          <option key={r} value={r}>
            {LIBELLES_RAYON[r]}
          </option>
        ))}
      </select>
    </label>,
  ];

  return (
    <div className="panneau-edition" role="group" aria-label={`Modifier l’ingrédient ${ingredient.nom}`}>
      {rangementEnPremier ? [champRangement, ...champs] : [...champs, champRangement]}
      <label className="interrupteur">
        <input type="checkbox" checked={placard} onChange={(e) => setPlacard(e.target.checked)} /> Produit de placard (vérifié une fois par
        mois, hors courses de la semaine)
      </label>
      <fieldset className="choix">
        <legend>Nutrition</legend>
        {table instanceof Error ? (
          <p className="texte-alerte petit">{table.message}</p>
        ) : (
          <>
            <p className="petit">
              Aliment Ciqual :{' '}
              {code ? (
                <>
                  <strong>{table?.aliments.get(code)?.nom ?? 'code absent de la table 2025'}</strong> <code className="discret">{code}</code>{' '}
                  <button type="button" className="bouton-lien" onClick={() => setCode(null)}>
                    Retirer
                  </button>
                </>
              ) : (
                <span className="discret">aucun (non compté dans la nutrition)</span>
              )}
            </p>
            <label className="champ">
              Chercher dans Ciqual
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. lentille verte sèche" />
            </label>
            {table && recherche.trim().length >= 2 && (
              <ul className="liste-choix" aria-label="Aliments Ciqual">
                {chercherAliments(table, recherche).map((a) => (
                  <li key={a.code}>
                    <button
                      type="button"
                      className="bouton-secondaire"
                      onClick={() => {
                        setCode(a.code);
                        setRecherche('');
                      }}
                    >
                      {a.nom} <span className="discret">({table.sousGroupes[a.sousGroupe] ?? a.sousGroupe})</span>
                    </button>
                  </li>
                ))}
                {chercherAliments(table, recherche).length === 0 && <li className="discret">Aucun aliment trouvé.</li>}
              </ul>
            )}
            <p className="discret petit">Choisissez l’état dans lequel la quantité est écrite (cru, sec, cuit, égoutté…).</p>
          </>
        )}
        {unites.map((u) => (
          <label className="champ" key={u}>
            Masse d’une unité « {LIBELLES_UNITE[u].replace('(s)', '')} » (g)
            <input inputMode="decimal" value={masses[u] ?? ''} onChange={(e) => setMasses({ ...masses, [u]: e.target.value })} placeholder="à peser" />
          </label>
        ))}
        {unites.length > 0 && <p className="discret petit">Pesez-la une fois : sans elle, les lignes dans cette unité ne sont pas comptées.</p>}
        <label className="interrupteur">
          <input type="checkbox" checked={feculent} onChange={(e) => setFeculent(e.target.checked)} /> Féculent (part ajustée selon le
          coefficient de chaque personne)
        </label>
      </fieldset>
      <p className="discret petit">Mémorisé sur ce téléphone pour tous les mois.</p>
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
        {perso && !perso.cree && (
          <button
            type="button"
            className="bouton-lien"
            onClick={() => {
              void oublierInfosIngredient(ingredient.id);
              fermer();
            }}
          >
            Revenir aux infos du plan
          </button>
        )}
      </div>
    </div>
  );
}
