// Minuteurs du mode cuisine : plusieurs en parallèle, gardés si la page est rechargée,
// avec vibration et bip à la fin et à chaque rappel.
import { useCallback, useEffect, useRef, useState } from 'react';

export type MinuteurActif = {
  id: string;
  libelle: string;
  finA: number;
  rappels: number[];
  /** Rappels et fin déjà signalés. */
  signales: number[];
};

const CLE = 'batch-minuteurs';

function charger(): MinuteurActif[] {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '[]') as MinuteurActif[];
  } catch {
    return [];
  }
}

let audio: AudioContext | null = null;
function bip() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, t + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.35 + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.35);
      o.stop(t + i * 0.35 + 0.3);
    }
  } catch {
    /* pas de son disponible */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export function useMinuteurs() {
  const [liste, setListe] = useState<MinuteurActif[]>(charger);
  const [maintenant, setMaintenant] = useState(Date.now());
  const listeRef = useRef(liste);
  listeRef.current = liste;

  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(liste));
    } catch {
      /* ignoré */
    }
  }, [liste]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setMaintenant(now);
      let change = false;
      const maj = listeRef.current.map((m) => {
        const echeances = [...m.rappels, m.finA].filter((e) => e <= now && !m.signales.includes(e));
        if (echeances.length === 0) return m;
        change = true;
        bip();
        return { ...m, signales: [...m.signales, ...echeances] };
      });
      if (change) setListe(maj);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const demarrer = useCallback((id: string, libelle: string, dureeMin: number, rappelsMin: number[] = []) => {
    const debut = Date.now();
    // Débloque l'audio sur mobile : il doit être créé suite à un geste de l'utilisateur.
    try {
      audio ??= new AudioContext();
      void audio.resume();
    } catch {
      /* ignoré */
    }
    setListe((l) => [
      ...l.filter((m) => m.id !== id),
      {
        id,
        libelle,
        finA: debut + dureeMin * 60_000,
        rappels: rappelsMin.filter((r) => r < dureeMin).map((r) => debut + r * 60_000),
        signales: [],
      },
    ]);
  }, []);

  const arreter = useCallback((id: string) => setListe((l) => l.filter((m) => m.id !== id)), []);

  return { liste, maintenant, demarrer, arreter };
}

export function formaterReste(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function BarreMinuteurs({ m }: { m: ReturnType<typeof useMinuteurs> }) {
  if (m.liste.length === 0) return null;
  return (
    <div className="minuteurs" role="region" aria-label="Minuteurs">
      {m.liste.map((x) => {
        const reste = x.finA - m.maintenant;
        const fini = reste <= 0;
        return (
          <div key={x.id} className={`minuteur ${fini ? 'minuteur-fini' : ''}`} aria-live={fini ? 'assertive' : 'off'}>
            <span className="minuteur-temps">{fini ? 'Terminé' : formaterReste(reste)}</span>
            <span className="minuteur-libelle">{x.libelle}</span>
            <button type="button" className="bouton-secondaire" onClick={() => m.arreter(x.id)} aria-label={`Arrêter le minuteur ${x.libelle}`}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
