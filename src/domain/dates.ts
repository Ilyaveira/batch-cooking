// Dates « calendaires » AAAA-MM-JJ, calculées en UTC pour éviter les décalages d'heure d'été.
import { JOURS } from './constantes';

function versUtc(date: string): number {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, j);
}

/** Nombre de jours entre deux dates (b - a). */
export function joursEntre(a: string, b: string): number {
  return Math.round((versUtc(b) - versUtc(a)) / 86_400_000);
}

export function ajouterJours(date: string, n: number): string {
  return new Date(versUtc(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = dimanche … 6 = samedi */
export function jourSemaine(date: string): number {
  return new Date(versUtc(date)).getUTCDay();
}

export function nomJour(date: string): string {
  return JOURS[jourSemaine(date)]!;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « dimanche 8 novembre » */
export function dateLongue(date: string): string {
  const [, m, j] = date.split('-').map(Number) as [number, number, number];
  return `${nomJour(date)} ${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
}

/** « 2026-11 » → « novembre 2026 » */
export function moisLong(mois: string): string {
  const [a, m] = mois.split('-').map(Number) as [number, number];
  return `${MOIS[m - 1]} ${a}`;
}

/** « 1:05 » → 65 */
export function minutesDepuisDebut(heure: string): number {
  const [h, m] = heure.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** 65 → « 1:05 » */
export function formaterHeureSession(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
