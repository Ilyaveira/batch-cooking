// Parcours mobile (Pixel 7) v2 : planning Gantt (portrait et paysage) et notation des recettes.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/v2-mobile.cjs
const { chromium, devices } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const OUT = path.resolve(__dirname, '../../test-results');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL_APP ?? 'http://localhost:4173/';

const verifier = (cond, message) => {
  if (!cond) throw new Error(`ÉCHEC : ${message}`);
  console.log(`✓ ${message}`);
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', acceptDownloads: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();

  // --- Gantt ---
  await page.goto(`${URL}#/semaine/1/session`);
  const gantt = page.locator('.gantt-conteneur svg.gantt');
  await gantt.waitFor();
  verifier((await gantt.getAttribute('aria-label')) === 'Planning : 14 tâches sur 2:15.', 'Gantt : 14 tâches sur 2:15');
  const largeur = await gantt.evaluate((s) => s.getBoundingClientRect().width);
  const ecran = await page.evaluate(() => window.innerWidth);
  verifier(largeur <= ecran, `le Gantt tient en largeur en portrait (${Math.round(largeur)} ≤ ${ecran} px)`);
  verifier((await page.locator('.gantt-conteneur rect.gantt-passif').count()) === 8, '8 cuissons passives (barres vertes)');
  await page.locator('.gantt-conteneur rect[data-etape="s1-09"]').first().click();
  await page.locator('.gantt-detail').getByText('Deux plaques').waitFor();
  verifier(true, 'toucher une barre affiche l’étape (0:57, Four, deux plaques)');

  await page.getByRole('button', { name: /Agrandir en paysage/ }).click();
  const tourne = page.locator('.gantt-plein-ecran-tourne');
  await tourne.waitFor();
  verifier((await tourne.getAttribute('data-tourne')) === 'true', 'vue paysage tournée de 90° (téléphone en portrait)');
  const boite = await tourne.locator('svg.gantt').evaluate((s) => {
    const r = s.getBoundingClientRect();
    return { l: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
  });
  verifier(boite.l <= boite.vw + 1 && boite.h <= boite.vh + 1, `tout le planning tient à l’écran (${Math.round(boite.l)}×${Math.round(boite.h)} dans ${boite.vw}×${boite.vh})`);
  await page.screenshot({ path: `${OUT}/v2-1-gantt-paysage.png` });
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.locator('.gantt-plein-ecran').waitFor({ state: 'detached' });
  verifier(true, 'fermer la vue paysage');

  // Le Gantt suit les modifications : four avancé à 0:45.
  await page.getByRole('button', { name: 'Réorganiser' }).click();
  const textes = await page.locator('.ligne-reorganisation').allInnerTexts();
  const n = textes.findIndex((t) => t.includes('Deux plaques')) + 1;
  await page.getByLabel(`Heure de l’étape ${n}`).fill('0:45');
  await page.getByLabel(`Heure de l’étape ${n}`).press('Enter');
  await page.getByText(/étapes liées décalées/).waitFor();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.locator('.gantt-conteneur rect[data-etape="s1-09"]').first().click();
  await page.locator('.gantt-detail .heure').getByText('0:45').waitFor();
  verifier(true, 'le Gantt suit la réorganisation (four à 0:45)');

  // --- Notation ---
  await page.goto(`${URL}#/reglages`);
  await page.getByLabel('Prénom').first().fill('Apolline');
  await page.getByLabel('Prénom').nth(1).fill('Aurélien');
  await page.getByLabel('Prénom').nth(1).blur();
  await page.goto(`${URL}#/recettes/mujaddara`);
  await page.getByText('Pas encore notée.').waitFor();
  await page.getByRole('button', { name: 'Noter', exact: true }).click();
  await page.getByRole('radio', { name: 'Facilité pour Apolline : 4 sur 5' }).click();
  await page.getByRole('radio', { name: 'Goût pour Apolline : 5 sur 5' }).click();
  await page.getByRole('radio', { name: 'Goût pour Aurélien : 3 sur 5' }).click();
  await page.getByRole('group', { name: 'Apolline' }).getByLabel('Commentaire').fill('À refaire, un peu plus de cumin');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.locator('.tableau-notes').waitFor();
  const moyenne = await page.locator('.tableau-notes tbody tr').first().innerText();
  verifier(moyenne.includes('Moyenne (2)') && moyenne.includes('4') && moyenne.includes('4'), `moyennes : goût 4, facilité 4 (${moyenne.replace(/\s+/g, ' ')})`);
  verifier((await page.locator('.historique-notes li').count()) === 2, 'historique : 2 notes (une par personne)');
  verifier(await page.getByText('« À refaire, un peu plus de cumin »').isVisible(), 'commentaire affiché');
  await page.screenshot({ path: `${OUT}/v2-2-notes.png`, fullPage: false });

  // Une 2e fois, seulement Apolline, goût 3.
  await page.getByRole('button', { name: 'Noter', exact: true }).click();
  await page.getByRole('radio', { name: 'Goût pour Apolline : 3 sur 5' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.historique-notes li').length === 3);
  verifier(true, 'deuxième notation : Aurélien peut ne pas noter (3 notes au total)');

  // Bibliothèque : tri par goût et filtre.
  await page.goto(`${URL}#/recettes`);
  await page.getByLabel('Trier par').selectOption('gout');
  const premiere = await page.locator('.liste-recettes li').first().innerText();
  verifier(premiere.includes('Mujaddara') && premiere.includes('Goût 3,7'), `tri par goût : Mujaddara en tête (goût 3,7)`);
  await page.getByLabel('Note').selectOption('gout4');
  verifier((await page.locator('.liste-recettes li').count()) === 0, 'filtre goût ≥ 4 : aucune recette (moyenne 3,7)');
  await page.getByLabel('Note').selectOption('jamais');
  verifier((await page.locator('.liste-recettes li').count()) === 6, 'filtre « jamais notées » : 6 recettes');
  await page.screenshot({ path: `${OUT}/v2-3-bibliotheque.png` });

  // Export des notes.
  await page.goto(`${URL}#/reglages`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter les notes' }).click()]);
  const e = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const m = e.recettes[0];
  verifier(e.format === 'batch-cooking-notes' && m.nom === 'Mujaddara' && m.nbNotes === 3 && m.gout === 3.7, 'export des notes : Mujaddara, 3 notes, goût 3,7');
  verifier(m.notes.some((x) => x.personne === 'Apolline' && x.commentaire === 'À refaire, un peu plus de cumin'), 'export : prénoms et commentaires');

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte')].some((el) => el.scrollWidth > el.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
