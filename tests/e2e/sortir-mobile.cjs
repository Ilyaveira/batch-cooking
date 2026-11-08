// Parcours mobile (Pixel 7) : cocher les ingrédients et ustensiles « à sortir ».
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/sortir-mobile.cjs
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
  const page = await (await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();
  await page.goto(`${URL}#/semaine/1/session`);

  const section = page.locator('section', { has: page.getByRole('heading', { name: 'À sortir' }) });
  const compteur = section.locator('.barre-outils span').first();
  await compteur.waitFor();
  const total = Number((await compteur.innerText()).match(/\/ (\d+)/)[1]);
  verifier((await compteur.innerText()).startsWith('0 /') && total > 40, `compteur de départ : ${await compteur.innerText()}`);

  const caseDe = (texte) => section.locator('label.case', { hasText: texte }).first();
  await caseDe('Blancs de poulet').click();
  await caseDe('Moule à cake').click();
  await page.waitForFunction(() => document.body.textContent.includes('2 / '));
  verifier(true, 'cocher un ingrédient (poulet) et un ustensile (moule à cake) : 2 sortis');
  verifier(await caseDe('Blancs de poulet').locator('input').isChecked(), 'poulet coché');
  await page.screenshot({ path: `${OUT}/sortir-1.png` });

  await page.reload();
  await compteur.waitFor();
  await page.waitForFunction(() => document.body.textContent.includes('2 / '), null, { timeout: 5000 });
  verifier(await caseDe('Moule à cake').locator('input').isChecked(), 'après rechargement : toujours cochés');

  // Les courses de la semaine ne sont pas touchées.
  await page.goto(`${URL}#/semaine/1/courses`);
  await page.getByText('Fruits et légumes').waitFor();
  verifier((await page.getByText(/^0 \/ \d+ articles$/).count()) === 1, 'les courses restent décochées (cases séparées)');

  await page.goto(`${URL}#/semaine/1/session`);
  await section.getByRole('button', { name: 'Tout décocher' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.barre-outils span')].some((s) => /^0 \/ /.test(s.textContent)));
  verifier(true, '« Tout décocher » remet le compteur à 0');

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte')].some((el) => el.scrollWidth > el.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
