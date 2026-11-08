// Parcours de bout en bout sur mobile émulé (Pixel 7) : import → plan → repas → courses →
// session → mode cuisine → recette → réglages → hors ligne. Captures dans test-results/.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/parcours-mobile.cjs
// (Playwright doit être installé : npm i -D playwright && npx playwright install chromium)
const { chromium, devices } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const OUT = path.resolve(__dirname, '../../test-results');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(String(e)));
  const debordements = [];
  const shot = async (n) => {
    const d = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.contenu, .cuisine, .carte')];
      return els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className);
    });
    if (d.length) debordements.push(`${n}: ${d.join(', ')}`);
    await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
  };
  await page.goto('http://localhost:4173/');
  await page.getByText('Aucun plan importé').waitFor();
  await shot('01-vide');
  await page.getByRole('link', { name: 'Importer un plan' }).first().click();
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByText('Plan valide').waitFor();
  await shot('02-import-valide');
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();
  await page.getByRole('link', { name: 'Voir le plan' }).click();
  await page.getByText('Semaine 1 ·').waitFor();
  await shot('03-plan');
  await page.getByRole('link', { name: 'Quand manger quoi' }).click();
  await page.getByText('Hors délai').first().waitFor();
  await shot('04-repas');
  await page.getByRole('link', { name: 'Courses', exact: true }).first().click();
  await page.getByText('Fruits et légumes').waitFor();
  await page.getByText('Butternut').click();
  await shot('05-courses');
  await page.locator('.nav-bas').getByRole('link', { name: /Session/ }).click();
  await page.getByText('À sortir').waitFor();
  await shot('06-session');
  await page.getByRole('heading', { name: 'Étapes' }).scrollIntoViewIfNeeded();
  await page.getByText('0:30 – 1:00').scrollIntoViewIfNeeded();
  await shot('07-etapes');
  await page.getByRole('link', { name: 'Passer en mode cuisine' }).click();
  await page.getByRole('button', { name: 'Démarrer maintenant' }).click();
  await page.getByRole('button', { name: /Minuteur 25 min/ }).first().click();
  await page.getByLabel('Étape 0:00 faite').first().click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Étape 0:00 faite"]').checked, null, { timeout: 3000 });
  console.log('Étape cochée : OK');
  await page.waitForTimeout(800);
  await shot('08-cuisine');
  await page.goto('http://localhost:4173/#/recettes');
  await page.getByText('Mujaddara').click();
  await page.getByRole('button', { name: 'Une portion de plus' }).click();
  await shot('09-recette');
  await page.goto('http://localhost:4173/#/reglages');
  await page.getByText('Durées de conservation').waitFor();
  await shot('10-reglages');
  // Hors ligne : le service worker doit servir l'app.
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 }).catch(() => {});
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.goto('http://localhost:4173/#/placard');
  await page.reload();
  await page.getByText('Placard').first().waitFor();
  await shot('11-placard-hors-ligne');
  console.log('Hors ligne OK');
  // Courses cochées persistées ?
  await page.goto('http://localhost:4173/#/semaine/1/courses');
  await page.getByText('Fruits et légumes').waitFor();
  const coche = await page
    .waitForFunction(() => [...document.querySelectorAll('label.case')].find((l) => l.textContent.includes('Butternut'))?.querySelector('input').checked, null, { timeout: 3000 })
    .then(() => true, () => false);
  console.log('Butternut coché après rechargement :', coche);
  console.log('Wake lock dispo :', await page.evaluate(() => 'wakeLock' in navigator));
  console.log('Débordements horizontaux :', debordements.length ? debordements : 'aucun');
  console.log('Erreurs console :', erreurs.length ? erreurs : 'aucune');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
