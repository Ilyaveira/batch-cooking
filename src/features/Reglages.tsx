// Réglages : personnes et aliments exclus, durées de conservation, four, robot, données.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlans, useReglages } from '../app/hooks';
import { enregistrerReglages, exporterSauvegarde, restaurerSauvegarde, supprimerPlan, type Sauvegarde } from '../data/depot';
import { JOURS } from '../domain/constantes';
import { moisLong } from '../domain/dates';
import { CONSERVATION_DEFAUT, type Reglages as TypeReglages, type TypeConservation } from '../domain/reglages';

function telecharger(nom: string, contenu: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

const versCle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function LigneConservation({ t, maj, supprimer }: { t: TypeConservation; maj: (t: TypeConservation) => void; supprimer: () => void }) {
  const incoherent = t.joursMin > t.joursMax;
  return (
    <li className="conservation">
      <div className="conservation-titre">
        <strong>{t.libelle}</strong> <code className="discret">{t.cle}</code>
      </div>
      <div className="conservation-champs">
        <label>
          de
          <input type="number" min={0} max={30} value={t.joursMin} onChange={(e) => maj({ ...t, joursMin: Number(e.target.value) })} />
        </label>
        <label>
          à
          <input type="number" min={0} max={30} value={t.joursMax} onChange={(e) => maj({ ...t, joursMax: Number(e.target.value) })} />
        </label>
        <span>jours</span>
        <button type="button" className="bouton-secondaire" onClick={supprimer} aria-label={`Supprimer ${t.libelle}`}>
          Supprimer
        </button>
      </div>
      {incoherent && <p className="texte-alerte petit">La borne basse dépasse la borne haute.</p>}
      <p className="discret petit">
        {t.source ? (
          <>
            Source :{' '}
            <a href={t.source.url} target="_blank" rel="noreferrer">
              {t.source.libelle}
            </a>
          </>
        ) : (
          'Réglage personnel (sans source)'
        )}
        {t.note && <> · {t.note}</>}
      </p>
    </li>
  );
}

export function Reglages() {
  const reglages = useReglages();
  const plans = usePlans();
  const [nouveau, setNouveau] = useState({ libelle: '', joursMin: 3, joursMax: 4 });
  const [message, setMessage] = useState<string | null>(null);
  const maj = (r: Partial<TypeReglages>) => void enregistrerReglages({ ...reglages, ...r });

  const majConservation = (cle: string, t: TypeConservation | null) =>
    maj({
      conservation: t
        ? reglages.conservation.map((x) => (x.cle === cle ? t : x))
        : reglages.conservation.filter((x) => x.cle !== cle),
    });

  const ajouterType = () => {
    const cle = versCle(nouveau.libelle);
    if (!cle || reglages.conservation.some((t) => t.cle === cle)) return;
    maj({ conservation: [...reglages.conservation, { cle, libelle: nouveau.libelle.trim(), joursMin: nouveau.joursMin, joursMax: nouveau.joursMax }] });
    setNouveau({ libelle: '', joursMin: 3, joursMax: 4 });
  };

  const restaurer = async (f: File | undefined) => {
    if (!f) return;
    try {
      const s = JSON.parse(await f.text()) as Sauvegarde;
      if (!confirm('Remplacer toutes les données de ce téléphone par cette sauvegarde ?')) return;
      await restaurerSauvegarde(s);
      setMessage('Sauvegarde restaurée.');
    } catch (e) {
      setMessage(`Échec : ${(e as Error).message}`);
    }
  };

  return (
    <>
      <header className="entete">
        <h1>Réglages</h1>
        <p className="discret">Ces données restent sur ce téléphone.</p>
      </header>

      <section className="carte">
        <h2>Personnes et aliments exclus</h2>
        {reglages.personnes.length === 0 && <p className="discret">Les personnes sont ajoutées à l’import d’un plan.</p>}
        {reglages.personnes.map((p, i) => (
          <div key={p.id} className="personne">
            <label className="champ">
              Prénom
              <input
                value={p.nom}
                onChange={(e) => maj({ personnes: reglages.personnes.map((x, k) => (k === i ? { ...x, nom: e.target.value } : x)) })}
              />
            </label>
            <label className="champ">
              Aliments exclus (séparés par des virgules)
              <input
                defaultValue={p.exclusions.join(', ')}
                placeholder="ex. champignons, roquette, fenouil"
                onBlur={(e) =>
                  maj({
                    personnes: reglages.personnes.map((x, k) =>
                      k === i ? { ...x, exclusions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : x,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
      </section>

      <section className="carte">
        <h2>Durées de conservation</h2>
        <p className="discret petit">
          Nombre de jours après la session (J0). Utilisées par « quand manger quoi ». Les valeurs par défaut viennent des sources
          citées dans le plan de novembre ; vérifiez-les et adaptez-les.
        </p>
        <ul className="liste-conservation">
          {reglages.conservation.map((t) => (
            <LigneConservation key={t.cle} t={t} maj={(n) => majConservation(t.cle, n)} supprimer={() => majConservation(t.cle, null)} />
          ))}
        </ul>
        <div className="ajout-type">
          <input
            placeholder="Nouveau type (ex. Cake salé)"
            aria-label="Nom du nouveau type"
            value={nouveau.libelle}
            onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })}
          />
          <input type="number" aria-label="Jours minimum" min={0} value={nouveau.joursMin} onChange={(e) => setNouveau({ ...nouveau, joursMin: Number(e.target.value) })} />
          <input type="number" aria-label="Jours maximum" min={0} value={nouveau.joursMax} onChange={(e) => setNouveau({ ...nouveau, joursMax: Number(e.target.value) })} />
          <button type="button" className="bouton-secondaire" onClick={ajouterType} disabled={!versCle(nouveau.libelle)}>
            Ajouter
          </button>
        </div>
        {nouveau.libelle && <p className="discret petit">Clé à utiliser dans le plan : <code>{versCle(nouveau.libelle)}</code></p>}
        <button type="button" className="bouton-secondaire" onClick={() => confirm('Rétablir les durées par défaut ?') && maj({ conservation: CONSERVATION_DEFAUT })}>
          Rétablir les valeurs par défaut
        </button>
      </section>

      <section className="carte">
        <h2>Cuisine</h2>
        <fieldset className="choix">
          <legend>Mon four</legend>
          <label>
            <input type="radio" name="four" checked={reglages.four.mode === 'chaleur-tournante'} onChange={() => maj({ four: { ...reglages.four, mode: 'chaleur-tournante' } })} />
            Chaleur tournante
          </label>
          <label>
            <input type="radio" name="four" checked={reglages.four.mode === 'traditionnel'} onChange={() => maj({ four: { ...reglages.four, mode: 'traditionnel' } })} />
            Traditionnel
          </label>
        </fieldset>
        <label className="champ">
          Écart chaleur tournante / traditionnel (°C)
          <input
            type="number"
            min={0}
            max={50}
            value={reglages.four.decalageChaleurTournanteC}
            onChange={(e) => maj({ four: { ...reglages.four, decalageChaleurTournanteC: Number(e.target.value) } })}
          />
        </label>
        <label className="interrupteur">
          <input type="checkbox" checked={reglages.cookExpert} onChange={(e) => maj({ cookExpert: e.target.checked })} /> Magimix Cook Expert disponible
        </label>
        <label className="champ">
          « Quand manger quoi » jusqu’au
          <select value={reglages.dernierJour} onChange={(e) => maj({ dernierJour: Number(e.target.value) })}>
            {[3, 4, 5, 6].map((j) => (
              <option key={j} value={j}>
                {JOURS[j]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="carte">
        <h2>Données</h2>
        <div className="actions">
          <Link className="bouton" to="/importer">
            Importer un plan
          </Link>
          <button type="button" className="bouton-secondaire" onClick={async () => telecharger(`batch-cooking-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, await exporterSauvegarde())}>
            Exporter une sauvegarde
          </button>
          <label className="bouton-secondaire bouton-fichier">
            Restaurer une sauvegarde
            <input type="file" accept="application/json,.json" onChange={(e) => void restaurer(e.target.files?.[0])} />
          </label>
        </div>
        {message && <p role="status">{message}</p>}
        <h3>Plans importés</h3>
        <ul className="liste-simple">
          {plans?.map((p) => (
            <li key={p.id} className="ligne-plan">
              <span>{moisLong(p.id)}</span>
              <span className="actions">
                <button type="button" className="bouton-secondaire" onClick={() => telecharger(`plan-${p.id}.json`, p.plan)}>
                  Exporter
                </button>
                <button
                  type="button"
                  className="bouton-secondaire"
                  onClick={() => confirm(`Supprimer le plan de ${moisLong(p.id)} et ses cases cochées ? Les recettes restent dans la bibliothèque.`) && void supprimerPlan(p.id)}
                >
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
