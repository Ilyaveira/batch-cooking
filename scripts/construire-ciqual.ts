// Construit public/data/ciqual-2025.json à partir des fichiers XML de la table Ciqual 2025 (ANSES).
//
// Source : « Table de composition nutritionnelle des aliments Ciqual 2025 », ANSES, publiée le
// 19/11/2025, doi:10.57745/RDMHWY, Licence Ouverte Etalab 2.0 (réutilisation libre avec mention
// de la source). Fichiers : https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY
//
// Usage : npx tsx scripts/construire-ciqual.ts <dossier contenant alim.xml, alim_grp.xml, compo.xml>
//
// Seuls les constituants utiles à l'app sont gardés. Les valeurs sont recopiées sans calcul :
// nombre, « < x » (inférieur à une limite), « traces », ou absente (« - » dans Ciqual).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSTITUANTS_CIQUAL, lireValeurCiqual, type ValeurCiqual } from '../src/domain/nutrition';

const dossier = process.argv[2];
if (!dossier) {
  console.error('Usage : npx tsx scripts/construire-ciqual.ts <dossier des XML Ciqual 2025>');
  process.exit(1);
}

const lire = (f: string) => readFileSync(join(dossier, f), 'utf8').replace(/^﻿/, '');

/** Éléments d'un XML plat (<TABLE><ELT><champ> valeur </champ>…</ELT>…). */
function* elements(xml: string, balise: string): Generator<Record<string, string>> {
  const re = new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`, 'g');
  for (const m of xml.matchAll(re)) {
    const champs: Record<string, string> = {};
    for (const c of m[1]!.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) champs[c[1]!] = decoder(c[2]!.trim());
    yield champs;
  }
}

function decoder(t: string): string {
  return t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const sousGroupes = new Map<string, string>();
for (const g of elements(lire('alim_grp.xml'), 'ALIM_GRP')) sousGroupes.set(g.alim_ssgrp_code!, g.alim_ssgrp_nom_fr!);

const codesConstituants = new Map<string, string>(Object.entries(CONSTITUANTS_CIQUAL).map(([cle, code]) => [code, cle]));
const valeurs = new Map<string, Record<string, ValeurCiqual>>();
const inconnues = new Set<string>();
for (const c of elements(lire('compo.xml'), 'COMPO')) {
  const cle = codesConstituants.get(c.const_code!);
  if (!cle) continue;
  const v = lireValeurCiqual(c.teneur ?? '');
  if (v === undefined) inconnues.add(c.teneur ?? '');
  const parAliment = valeurs.get(c.alim_code!) ?? {};
  parAliment[cle] = v ?? null;
  valeurs.set(c.alim_code!, parAliment);
}
if (inconnues.size) {
  console.error(`Format de teneur non reconnu : ${[...inconnues].slice(0, 10).join(' | ')}`);
  process.exit(1);
}

const cles = Object.keys(CONSTITUANTS_CIQUAL);
const aliments: (string | ValeurCiqual)[][] = [];
for (const a of elements(lire('alim.xml'), 'ALIM')) {
  const v = valeurs.get(a.alim_code!) ?? {};
  aliments.push([a.alim_code!, a.alim_nom_fr!, a.alim_ssgrp_code!, ...cles.map((k) => v[k] ?? null)]);
}
aliments.sort((x, y) => Number(x[0]) - Number(y[0]));

const sortie = {
  source: {
    libelle: 'Table de composition nutritionnelle des aliments Ciqual 2025 (ANSES)',
    version: '2025',
    publication: '2025-11-19',
    doi: '10.57745/RDMHWY',
    url: 'https://doi.org/10.57745/RDMHWY',
    licence: 'Licence Ouverte / Open Licence Etalab 2.0',
    licenceUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    note: 'Valeurs pour 100 g de partie comestible. Extrait : constituants listés dans « colonnes » ; « tr » = traces, « <x » = inférieur à x, null = absent de la table.',
  },
  colonnes: ['code', 'nom', 'sousGroupe', ...cles],
  sousGroupes: Object.fromEntries([...sousGroupes].filter(([code]) => aliments.some((a) => a[2] === code))),
  aliments,
};
const chemin = new URL('../public/data/ciqual-2025.json', import.meta.url);
writeFileSync(chemin, JSON.stringify(sortie));
console.log(`${aliments.length} aliments, ${cles.length} constituants → ${chemin.pathname}`);
