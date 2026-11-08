// Mode cuisine : gros texte, écran qui reste allumé, minuteurs, étapes à cocher.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCochages, useEcranAllume, useReglages } from '../app/hooks';
import { cles, cocher } from '../data/depot';
import { formaterHeureSession, heureHorloge, minutesDepuisDebut } from '../domain/dates';
import type { Plan, Semaine } from '../domain/schema/plan';
import { blocs as calculerBlocs, type Bloc } from '../domain/reorganisation';
import { minuteurEtape } from '../domain/session';
import { BarreMinuteurs, useMinuteurs } from '../ui/minuteurs';
import { ContenuBloc } from './EtapeSession';

const LIBELLES_ECRAN = {
  actif: 'Écran maintenu allumé',
  indisponible: 'Ce navigateur ne peut pas garder l’écran allumé',
  refuse: 'Écran allumé refusé par le navigateur',
  inactif: 'Écran allumé en attente',
};

export function Cuisine({ plan, semaine }: { plan: Plan; semaine: Semaine }) {
  const reglages = useReglages();
  const ecran = useEcranAllume(true);
  const chronos = useMinuteurs();
  const prefixe = cles.prefixeEtapes(plan.mois, semaine.numero);
  const { coches } = useCochages(prefixe);
  const cleChrono = `batch-chrono-${plan.mois}-${semaine.numero}`;
  const [debut, setDebut] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(cleChrono));
      // Une heure de début vieille de plus de 24 h vient d'une session passée : on l'ignore.
      return v && Date.now() - v < 86_400_000 ? v : null;
    } catch {
      return null;
    }
  });
  const prochaineRef = useRef<HTMLLIElement>(null);

  const session = semaine.session;
  // Une carte par bloc : une étape seule, ou plusieurs étapes fusionnées (une case pour toutes).
  const liste = session ? calculerBlocs(session) : [];
  const cle = (id: string) => cles.etape(plan.mois, semaine.numero, id);
  const blocFait = (b: Bloc) => b.membres.every((m) => coches.has(cle(m.id)));
  const prochaine = liste.find((b) => !blocFait(b));
  const ecoule = debut === null ? null : Math.floor((chronos.maintenant - debut) / 60_000);

  useEffect(() => {
    prochaineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [prochaine?.id]);

  // Heure de début : « Démarrer » = maintenant, ou heure choisie (ex. 14:30, aujourd'hui).
  // Sans heure de début, les étapes gardent les heures du plan (0:00, 0:05…).
  const fixerDebut = (t: number | null) => {
    setDebut(t);
    try {
      if (t === null) localStorage.removeItem(cleChrono);
      else localStorage.setItem(cleChrono, String(t));
    } catch {
      /* ignoré */
    }
  };
  const choisirHeure = (valeur: string) => {
    const [h, m] = valeur.split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    fixerDebut(d.getTime());
  };
  const heureDebut =
    debut === null
      ? null
      : `${String(new Date(debut).getHours()).padStart(2, '0')}:${String(new Date(debut).getMinutes()).padStart(2, '0')}`;

  if (!session) {
    return (
      <div className="cuisine">
        <p>Pas de déroulé de session pour cette semaine.</p>
        <Link to={`/semaine/${semaine.numero}/session`}>Retour</Link>
      </div>
    );
  }

  const faites = liste.filter(blocFait).length;

  return (
    <div className="cuisine">
      <header className="cuisine-entete">
        <Link to={`/semaine/${semaine.numero}/session`} className="bouton-secondaire">
          ‹ Quitter
        </Link>
        <div className="cuisine-infos">
          <strong>
            {faites}/{liste.length}
          </strong>
          {ecoule !== null &&
            (ecoule >= 0 ? (
              <span className="chrono" aria-label="Temps écoulé depuis le début">
                ⏱ {formaterHeureSession(ecoule)}
              </span>
            ) : (
              <span className="chrono">Début à {heureDebut}</span>
            ))}
        </div>
      </header>
      <div className="heure-debut">
        <label>
          Heure de début
          <input type="time" value={heureDebut ?? ''} onChange={(ev) => choisirHeure(ev.target.value)} />
        </label>
        {debut === null ? (
          <button type="button" className="bouton" onClick={() => fixerDebut(Date.now())}>
            Démarrer maintenant
          </button>
        ) : (
          <button type="button" className="bouton-secondaire" onClick={() => fixerDebut(null)}>
            Effacer
          </button>
        )}
      </div>
      <p className={`petit ${ecran === 'actif' ? 'discret' : 'texte-alerte'}`}>{LIBELLES_ECRAN[ecran]}</p>
      <BarreMinuteurs m={chronos} />

      <ol className="cuisine-etapes">
        {liste.map((b) => {
          const fait = blocFait(b);
          const estProchaine = prochaine?.id === b.id;
          const enRetard = !fait && ecoule !== null && minutesDepuisDebut(b.debut) <= ecoule;
          const minuteurs = b.membres.map((m) => minuteurEtape(m)).filter((m) => m !== null);
          return (
            <li
              key={b.id}
              ref={estProchaine ? prochaineRef : undefined}
              className={`cuisine-etape ${fait ? 'fait' : ''} ${estProchaine ? 'prochaine' : ''} ${enRetard ? 'a-faire-maintenant' : ''}`}
            >
              <label className="cuisine-case">
                <input
                  type="checkbox"
                  checked={fait}
                  onChange={() => b.membres.forEach((m) => void cocher(cle(m.id), !fait))}
                  aria-label={`Étape ${b.debut} faite`}
                />
              </label>
              <div>
                <ContenuBloc
                  bloc={b}
                  session={session}
                  reglages={reglages}
                  heureHorloge={heureDebut ? heureHorloge(heureDebut, b.debut) : undefined}
                />
                {!fait &&
                  minuteurs.map((m) => (
                    <button
                      key={m.etape}
                      type="button"
                      className="bouton-secondaire bouton-minuteur"
                      onClick={() => chronos.demarrer(m.etape, m.libelle.slice(0, 40), m.dureeMin, m.rappelsMin)}
                    >
                      ⏱ {minuteurs.length > 1 ? `${m.libelle.slice(0, 24)}… ` : 'Minuteur '}
                      {m.dureeMin} min{m.rappelsMin.length > 0 ? ` (rappels à ${m.rappelsMin.join(', ')} min)` : ''}
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
      {!prochaine && <p className="carte">Session terminée. Bon appétit !</p>}
    </div>
  );
}
