// Mode cuisine : gros texte, écran qui reste allumé, minuteurs, étapes à cocher.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCochages, useEcranAllume, useReglages } from '../app/hooks';
import { cles } from '../data/depot';
import { formaterHeureSession, minutesDepuisDebut } from '../domain/dates';
import type { Plan, Semaine } from '../domain/schema/plan';
import { etapesTriees, minuteurEtape } from '../domain/session';
import { BarreMinuteurs, useMinuteurs } from '../ui/minuteurs';
import { ContenuEtape } from './EtapeSession';

const LIBELLES_ECRAN = {
  actif: 'Écran maintenu allumé',
  indisponible: 'Ce navigateur ne peut pas garder l’écran allumé',
  refuse: 'Écran allumé refusé par le navigateur',
  inactif: 'Écran allumé en attente',
};

export function Cuisine({ plan, semaine }: { plan: Plan; semaine: Semaine }) {
  const reglages = useReglages();
  const ecran = useEcranAllume(true);
  const minuteurs = useMinuteurs();
  const prefixe = cles.prefixeEtapes(plan.mois, semaine.numero);
  const { coches, basculer } = useCochages(prefixe);
  const cleChrono = `batch-chrono-${plan.mois}-${semaine.numero}`;
  const [debut, setDebut] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(cleChrono);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const prochaineRef = useRef<HTMLLIElement>(null);

  const session = semaine.session;
  const etapes = session ? etapesTriees(session) : [];
  const prochaine = etapes.find((e) => !coches.has(cles.etape(plan.mois, semaine.numero, e.id)));
  const ecoule = debut === null ? null : Math.floor((minuteurs.maintenant - debut) / 60_000);

  useEffect(() => {
    prochaineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [prochaine?.id]);

  const demarrerChrono = () => {
    const t = Date.now();
    setDebut(t);
    try {
      localStorage.setItem(cleChrono, String(t));
    } catch {
      /* ignoré */
    }
  };

  if (!session) {
    return (
      <div className="cuisine">
        <p>Pas de déroulé de session pour cette semaine.</p>
        <Link to={`/semaine/${semaine.numero}/session`}>Retour</Link>
      </div>
    );
  }

  const faites = etapes.length - etapes.filter((e) => !coches.has(cles.etape(plan.mois, semaine.numero, e.id))).length;

  return (
    <div className="cuisine">
      <header className="cuisine-entete">
        <Link to={`/semaine/${semaine.numero}/session`} className="bouton-secondaire">
          ‹ Quitter
        </Link>
        <div className="cuisine-infos">
          <strong>
            {faites}/{etapes.length}
          </strong>
          {ecoule !== null ? (
            <span className="chrono" aria-label="Temps écoulé depuis le début">
              ⏱ {formaterHeureSession(Math.max(0, ecoule))}
            </span>
          ) : (
            <button type="button" className="bouton" onClick={demarrerChrono}>
              Démarrer la session
            </button>
          )}
        </div>
      </header>
      <p className={`petit ${ecran === 'actif' ? 'discret' : 'texte-alerte'}`}>{LIBELLES_ECRAN[ecran]}</p>
      <BarreMinuteurs m={minuteurs} />

      <ol className="cuisine-etapes">
        {etapes.map((e) => {
          const cle = cles.etape(plan.mois, semaine.numero, e.id);
          const fait = coches.has(cle);
          const estProchaine = prochaine?.id === e.id;
          const enRetard = !fait && ecoule !== null && minutesDepuisDebut(e.debut) <= ecoule;
          const m = minuteurEtape(e);
          return (
            <li
              key={e.id}
              ref={estProchaine ? prochaineRef : undefined}
              className={`cuisine-etape ${fait ? 'fait' : ''} ${estProchaine ? 'prochaine' : ''} ${enRetard ? 'a-faire-maintenant' : ''}`}
            >
              <label className="cuisine-case">
                <input type="checkbox" checked={fait} onChange={() => void basculer(cle)} aria-label={`Étape ${e.debut} faite`} />
              </label>
              <div>
                <ContenuEtape e={e} session={session} reglages={reglages} />
                {m && !fait && (
                  <button
                    type="button"
                    className="bouton-secondaire bouton-minuteur"
                    onClick={() => minuteurs.demarrer(e.id, m.libelle.slice(0, 40), m.dureeMin, m.rappelsMin)}
                  >
                    ⏱ Minuteur {m.dureeMin} min{m.rappelsMin.length > 0 ? ` (rappels à ${m.rappelsMin.join(', ')} min)` : ''}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!prochaine && <p className="carte">Session terminée. Bon appétit !</p>}
    </div>
  );
}
