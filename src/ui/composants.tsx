// Petits composants réutilisés par plusieurs écrans.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LIBELLES_POSTE, type Poste } from '../domain/constantes';
import type { Statut } from '../domain/calendrier';
import { morceauxTexte } from '../domain/session';

/** Texte d'étape : seuls les passages **…** sont mis en valeur. */
export function TexteEtape({ texte }: { texte: string }) {
  return (
    <>
      {morceauxTexte(texte).map((m, i) => (m.gras ? <strong key={i} className="ingredient">{m.texte}</strong> : <span key={i}>{m.texte}</span>))}
    </>
  );
}

export function PastillePoste({ poste }: { poste: Poste }) {
  return <span className={`poste poste-${poste}`}>{LIBELLES_POSTE[poste]}</span>;
}

const LIBELLES_STATUT: Record<Statut, string> = {
  ok: 'Dans les temps',
  limite: 'Limite',
  depasse: 'Hors délai',
  inconnu: 'Durée non renseignée',
};

export function PastilleStatut({ statut, jours }: { statut: Statut; jours: number }) {
  return (
    <span className={`statut statut-${statut}`}>
      J+{jours} · {LIBELLES_STATUT[statut]}
    </span>
  );
}

export function Case({
  coche,
  onChange,
  children,
  grand,
}: {
  coche: boolean;
  onChange: () => void;
  children: ReactNode;
  grand?: boolean;
}) {
  return (
    <label className={`case ${coche ? 'case-cochee' : ''} ${grand ? 'case-grande' : ''}`}>
      <input type="checkbox" checked={coche} onChange={onChange} />
      <span className="case-contenu">{children}</span>
    </label>
  );
}

export function AucunPlan() {
  return (
    <div className="carte vide">
      <p>Aucun plan importé pour l’instant.</p>
      <Link className="bouton" to="/importer">
        Importer un plan
      </Link>
    </div>
  );
}

export function EnChargement() {
  return <p className="discret" aria-busy="true">Chargement…</p>;
}
