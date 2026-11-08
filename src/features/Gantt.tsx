// Planning de la session (Gantt) : une ligne par tâche, barres actif / cuisson passive / à surveiller.
// Vue « Agrandir en paysage » : plein écran, tournée de 90° quand le téléphone est en portrait
// (l'app installée est verrouillée en portrait par son manifeste).
import { useEffect, useRef, useState } from 'react';
import { geometrieGantt, raccourcir, type GeometrieGantt } from '../domain/gantt';
import type { Session } from '../domain/schema/plan';
import { planning } from '../domain/session';
import { formaterHeureSession } from '../domain/dates';
import { PastillePoste, TexteEtape } from '../ui/composants';

const LIBELLES_TYPE = { actif: 'Tu es active', passif: 'Cuisson passive, mains libres', alerte: 'À surveiller' } as const;

/** Largeur d'un élément, mise à jour quand elle change. */
function useLargeur<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maj = () => setLargeur(el.clientWidth);
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, largeur };
}

function SvgGantt({ g, selection, choisir }: { g: GeometrieGantt; selection: string | null; choisir: (etape: string) => void }) {
  const resume = `Planning : ${g.lignes.length} tâches sur ${formaterHeureSession(g.finMin)}.`;
  return (
    <svg className="gantt" width={g.largeur} height={g.hauteur} viewBox={`0 0 ${g.largeur} ${g.hauteur}`} role="img" aria-label={resume}>
      {g.lignes.map((l, i) => (
        <rect key={`fond-${l.id}`} x={0} y={l.y} width={g.largeur} height={g.hauteurLigne} className={i % 2 ? 'gantt-fond-impair' : 'gantt-fond'} />
      ))}
      {g.graduations.map((t) => (
        <g key={t.minute}>
          <line x1={t.x} x2={t.x} y1={g.hauteurEntete - 4} y2={g.hauteur} className="gantt-grille" />
          <text x={t.x} y={14} textAnchor="middle" className="gantt-graduation">
            {t.libelle}
          </text>
        </g>
      ))}
      {g.lignes.map((l) => (
        <g key={l.id}>
          <text x={4} y={l.y + g.hauteurLigne / 2 + 4} className="gantt-libelle">
            <title>{l.libelle}</title>
            {raccourcir(l.libelle, g.x0 - 8)}
          </text>
          {l.barres.map((b, k) => (
            <rect
              key={k}
              x={b.x}
              y={l.y + 6}
              width={b.largeur}
              height={g.hauteurLigne - 12}
              rx={3}
              className={`gantt-${b.type} ${selection === b.etape ? 'gantt-choisie' : ''}`}
              data-etape={b.etape}
              onClick={() => choisir(b.etape)}
            >
              <title>
                {LIBELLES_TYPE[b.type]} : {formaterHeureSession(b.debut)} – {formaterHeureSession(b.fin)}
              </title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}

function Legende() {
  return (
    <p className="gantt-legende">
      {(['actif', 'passif', 'alerte'] as const).map((t) => (
        <span key={t}>
          <span className={`gantt-pastille gantt-${t}`} aria-hidden="true" />
          {LIBELLES_TYPE[t]}
        </span>
      ))}
    </p>
  );
}

/** Étape touchée sur le planning : heure, poste et consigne. */
function DetailEtape({ session, id }: { session: Session; id: string | null }) {
  const e = id ? session.etapes.find((x) => x.id === id) : undefined;
  if (!e) return <p className="discret petit">Touchez une barre pour voir l’étape.</p>;
  return (
    <div className="gantt-detail" aria-live="polite">
      <span className="heure">{e.debut}</span> {e.alerte && '⚠ '}
      <PastillePoste poste={e.poste} />{' '}
      <TexteEtape texte={e.texte} />
    </div>
  );
}

type OrientationVerrouillable = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void };

function VuePaysage({ session, fermer }: { session: Session; fermer: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ l: window.innerWidth, h: window.innerHeight });
  const [selection, setSelection] = useState<string | null>(null);

  useEffect(() => {
    const maj = () => setDims({ l: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', maj);
    // Plein écran + paysage quand le navigateur l'accepte ; sinon la rotation CSS suffit.
    const orientation = screen.orientation as OrientationVerrouillable | undefined;
    ref.current
      ?.requestFullscreen?.()
      .then(() => orientation?.lock?.('landscape'))
      .catch(() => undefined);
    return () => {
      window.removeEventListener('resize', maj);
      try {
        orientation?.unlock?.();
      } catch {
        /* ignoré */
      }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const portrait = dims.h > dims.l;
  const largeur = portrait ? dims.h : dims.l;
  const hauteur = portrait ? dims.l : dims.h;
  const style = portrait
    ? { width: largeur, height: hauteur, transform: `translateX(${dims.l}px) rotate(90deg)`, transformOrigin: 'top left' }
    : { width: largeur, height: hauteur };
  // Tout doit tenir à l'écran : hauteur des lignes ajustée à la place (entre 16 et 28 px).
  const p = planning(session);
  const place = hauteur - 16 - 52 - 44 - 24; // marges, en-tête, détail de l'étape, graduations
  const hauteurLigne = Math.max(16, Math.min(28, Math.floor(place / Math.max(1, p.couloirs.length))));
  const g = geometrieGantt(p, { largeur: largeur - 24, largeurLibelles: Math.min(220, largeur * 0.24), hauteurLigne });

  // La rotation est portée par un conteneur intérieur : le navigateur annule tout « transform »
  // sur l'élément mis en plein écran lui-même.
  return (
    <div ref={ref} className="gantt-plein-ecran" role="dialog" aria-label="Planning en paysage">
      <div className="gantt-plein-ecran-tourne" data-tourne={portrait} style={style}>
      <div className="gantt-plein-ecran-entete">
        <strong>Planning</strong>
        <Legende />
        <button type="button" className="bouton" onClick={fermer}>
          Fermer
        </button>
      </div>
      <div className="gantt-plein-ecran-corps">
        <SvgGantt g={g} selection={selection} choisir={setSelection} />
        <DetailEtape session={session} id={selection} />
      </div>
      </div>
    </div>
  );
}

export function Gantt({ session }: { session: Session }) {
  const { ref, largeur } = useLargeur<HTMLDivElement>();
  const [selection, setSelection] = useState<string | null>(null);
  const [paysage, setPaysage] = useState(false);
  const g = largeur > 0 ? geometrieGantt(planning(session), { largeur, largeurLibelles: Math.min(150, Math.round(largeur * 0.32)) }) : null;
  return (
    <>
      <div ref={ref} className="gantt-conteneur">
        {g && <SvgGantt g={g} selection={selection} choisir={setSelection} />}
      </div>
      <Legende />
      <DetailEtape session={session} id={selection} />
      <button type="button" className="bouton-secondaire" onClick={() => setPaysage(true)}>
        ⤢ Agrandir en paysage
      </button>
      {paysage && <VuePaysage session={session} fermer={() => setPaysage(false)} />}
    </>
  );
}
