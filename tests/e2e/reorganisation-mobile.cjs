// Parcours mobile (Pixel 7) : réorganisation des étapes + heure de début du mode cuisine + export.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/reorganisation-mobile.cjs
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
  const lignes = () => page.locator('.ligne-reorganisation');
  const texteLigne = (n) => lignes().nth(n - 1).locator('.etape-texte').innerText();
  const heureLigne = (n) => page.getByLabel(`Heure de l’étape ${n}`).inputValue();

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();

  await page.goto(`${URL}#/semaine/1/session`);
  await page.getByRole('button', { name: 'Réorganiser' }).click();
  verifier((await texteLigne(13)).includes('300 g de brocolis'), 'n° 13 = brocolis vapeur');

  // Numéro 13 → 9 : prend la place (et l'heure 0:57) des deux plaques au four.
  const n13 = page.getByLabel('Numéro de l’étape 13');
  await n13.fill('9');
  await n13.press('Enter');
  await page.getByText('Ordre modifié sur cet appareil.').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.ligne-reorganisation .etape-texte')[8]?.textContent.includes('300 g de brocolis'));
  verifier((await heureLigne(9)) === '0:57', 'brocolis vapeur devenu n° 9 à 0:57');
  verifier((await texteLigne(10)).includes('Deux plaques'), 'les deux plaques décalées en n° 10');

  // Flèche ↑ sur le n° 9 : passe en n° 8 avec l'heure 0:42.
  await page.getByRole('button', { name: 'Monter l’étape 9' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ligne-reorganisation .etape-texte')[7]?.textContent.includes('300 g de brocolis'));
  verifier((await heureLigne(8)) === '0:42', 'flèche ↑ : n° 8 à 0:42');

  // Numéro invalide : refusé, rien ne bouge.
  const n5 = page.getByLabel('Numéro de l’étape 5');
  await n5.fill('99');
  await n5.press('Enter');
  await page.getByText('Le numéro doit être compris entre 1 et 23.').waitFor();
  verifier((await n5.inputValue()) === '5', 'numéro 99 refusé, valeur remise à 5');

  // Heure : la découpe (n° 9 désormais, 0:42) passe à 0:25 → se replace avant l'égouttage (0:30).
  const idxDecoupe = (await lignes().allInnerTexts()).findIndex((t) => t.includes('500 g de brocolis'));
  const champ = page.getByLabel(`Heure de l’étape ${idxDecoupe + 1}`);
  await champ.fill('25');
  await champ.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ligne-reorganisation .etape-texte')[6]?.textContent.includes('500 g de brocolis'));
  verifier((await heureLigne(7)) === '0:25', 'découpe saisie « 25 » → n° 7 à 0:25');
  await page.screenshot({ path: `${OUT}/reorg-1-session.png` });

  // Export du plan : contient l'ordre et les heures modifiés.
  await page.goto(`${URL}#/reglages`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()]);
  const exporte = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const etapes = exporte.semaines[0].session.etapes;
  verifier(etapes[6].id === 's1-08' && etapes[6].debut === '0:25', 'export : découpe à 0:25 en 7ᵉ position');
  verifier(etapes[7].id === 's1-07', 'export : égouttage juste après');

  // Mode cuisine : nouvel ordre + heure de début.
  await page.goto(`${URL}#/semaine/1/cuisine`);
  await page.locator('.cuisine-etape').first().waitFor();
  const textes = await page.locator('.cuisine-etape .etape-texte').allInnerTexts();
  verifier(textes[6].includes('500 g de brocolis'), 'mode cuisine : nouvel ordre affiché');
  verifier((await page.locator('.cuisine-etape .heure').first().innerText()) === '0:00', 'sans heure de début : 0:00');
  await page.getByLabel('Heure de début').fill('14:30');
  await page.waitForFunction(() => document.querySelector('.cuisine-etape .heure')?.textContent === '14:30');
  const heures = await page.locator('.cuisine-etape .heure').allInnerTexts();
  verifier(heures[2] === '14:35', 'heure de début 14:30 → lentilles à 14:35');
  verifier(heures[6] === '14:55', 'découpe (0:25) → 14:55');
  verifier((await page.locator('.cuisine-etape .heure-relative').first().innerText()) === '(0:00)', 'heure relative visible');
  await page.screenshot({ path: `${OUT}/reorg-2-cuisine-heure.png` });
  await page.getByRole('button', { name: 'Effacer' }).click();
  await page.waitForFunction(() => document.querySelector('.cuisine-etape .heure')?.textContent === '0:00');
  verifier(true, '« Effacer » : retour aux heures du plan');

  // Retour à l'ordre du plan.
  await page.goto(`${URL}#/semaine/1/session`);
  await page.getByRole('button', { name: 'Réorganiser' }).click();
  await page.getByRole('button', { name: 'Revenir à l’ordre du plan' }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('Ordre modifié sur cet appareil.'));
  verifier((await texteLigne(13)).includes('300 g de brocolis') && (await heureLigne(13)) === '1:13', 'ordre du plan rétabli');

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte')].some((e) => e.scrollWidth > e.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
