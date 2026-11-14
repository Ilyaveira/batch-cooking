// Parcours mobile (Pixel 7) : objectifs et coefficient féculents dans les Réglages, nutrition par
// portion et par personne sur la fiche, compléter un ingrédient (masse, code Ciqual), étiquettes,
// totaux par jour, filtre de la bibliothèque, export de la bibliothèque.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/nutrition-mobile.cjs
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
// Un contenu trop large élargit la mise en page mobile (innerWidth > largeur de l'écran).
const largeurOk = (page) => page.evaluate(() => window.innerWidth <= screen.width && document.documentElement.scrollWidth <= window.innerWidth);
const nombre = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));

(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', acceptDownloads: true })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();

  // 1. Réglages : objectifs et coefficient de la personne A.
  await page.goto(`${URL}#/reglages`);
  const a = page.getByRole('group', { name: 'Objectifs par jour de Personne A' });
  await a.getByLabel('Énergie min (kcal)').fill('1650');
  await a.getByLabel('Énergie max (kcal)').fill('1750');
  await a.getByLabel('Protéines min (g)').fill('100');
  await a.getByLabel('Protéines max (g)').fill('130');
  await a.getByLabel(/Coefficient féculents/).fill('0.75');
  await page.waitForTimeout(300);
  verifier((await page.getByLabel(/Seuil « pauvre en glucides »/).inputValue()) === '26', 'réglages : objectifs saisis, seuil glucides par défaut 26 %');
  verifier(await largeurOk(page), 'réglages : pas plus large que l’écran');

  // 2. Fiche : nutrition par portion, par personne.
  await page.goto(`${URL}#/recettes/sheet-pan-poulet-butternut?semaine=1`);
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Nutrition par portion' }) });
  await section.locator('table').waitFor();
  const entetes = await section.locator('thead th').allInnerTexts();
  verifier(entetes.join('|') === 'Par portion|Personne A|Personne B', 'fiche : une colonne par personne');
  const avant = await section.locator('tbody tr').first().locator('td').allInnerTexts();
  verifier(avant[0] === avant[1], `féculents non comptés (pois chiches, semoule) : A = B (${avant[0]} kcal)`);
  verifier(await section.getByText(/Calcul incomplet/).isVisible(), 'calcul incomplet signalé (quantités non précisées)');
  verifier(await section.getByText(/Pois chiches \(boîte de 400 g\) : masse de l’unité inconnue/).isVisible(), 'non compté : pois chiches (masse d’une boîte inconnue)');
  verifier(await section.getByText(/de l’objectif du jour \(1650–1750 kcal\)/).isVisible(), 'part de l’objectif journalier de la personne A');
  verifier(await section.getByRole('link', { name: /Ciqual 2025/ }).isVisible(), 'source Ciqual 2025 affichée');

  // 3. Compléter un ingrédient depuis la fiche : masse d'une boîte de pois chiches égouttés.
  await section.getByRole('button', { name: 'Compléter Pois chiches (boîte de 400 g)' }).click();
  await section.getByLabel(/Masse d’une unité « boîte » \(g\)/).fill('240');
  await section.getByRole('button', { name: 'Enregistrer' }).click();
  await section.getByText(/Pois chiches \(boîte de 400 g\) : masse/).waitFor({ state: 'detached' });
  verifier(true, 'masse d’une boîte enregistrée : pois chiches comptés');
  const kcal = await section.locator('tbody tr').first().locator('td').allInnerTexts();
  verifier(nombre(kcal[0]) < nombre(kcal[1]), `féculents ajustés : A (${kcal[0]}) < B (${kcal[1]}) kcal`);
  verifier(await largeurOk(page), 'fiche : pas plus large que l’écran');
  verifier(await section.locator('.tableau-defilant').evaluate((el) => el.scrollWidth <= el.clientWidth), 'tableau nutrition entièrement visible sans défilement');
  await page.screenshot({ path: `${OUT}/nutrition-1-fiche.png`, fullPage: true });

  // 4. Code Ciqual choisi par recherche (cottage cheese, absent du plan).
  await page.goto(`${URL}#/recettes/mujaddara?semaine=1`);
  const s2 = page.locator('section', { has: page.getByRole('heading', { name: 'Nutrition par portion' }) });
  await s2.getByRole('button', { name: 'Compléter Cottage cheese' }).click();
  await s2.getByLabel('Chercher dans Ciqual').fill('fromage frais nature');
  await s2.getByRole('list', { name: 'Aliments Ciqual' }).getByRole('button').first().click();
  await s2.getByRole('button', { name: 'Enregistrer' }).click();
  await s2.getByText(/Cottage cheese : pas de code Ciqual/).waitFor({ state: 'detached' });
  verifier(true, 'code Ciqual choisi pour le cottage cheese');
  // Mujaddara pour la seule personne A : une seule colonne personne.
  verifier((await s2.locator('thead th').allInnerTexts()).join('|') === 'Par portion|Personne A', 'plat pour une personne : une colonne');

  // 5. Étiquettes : saisons et étiquette libre.
  await page.getByRole('button', { name: '✎ Étiquettes' }).click();
  await page.getByLabel('Printemps').check();
  await page.getByLabel(/Étiquettes libres/).fill('lunchbox, rapide');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.locator('header .etiquette', { hasText: 'lunchbox' }).waitFor();
  verifier(await page.locator('header .etiquette', { hasText: 'Printemps' }).isVisible(), 'étiquettes : printemps et « lunchbox » ajoutées');

  // 6. Quand manger quoi : totaux du jour par personne avec position par rapport à l'objectif.
  await page.goto(`${URL}#/semaine/1`);
  const jour = page.locator('section.jour', { hasText: 'mardi 10 novembre' });
  const totalA = await jour.locator('.total-personne', { hasText: 'Personne A' }).innerText();
  verifier(/kcal/.test(totalA) && /protéines/.test(totalA) && /objectif 1650–1750 kcal, 100–130 g/.test(totalA), `totaux du mardi pour A : « ${totalA.replace(/\s+/g, ' ')} »`);
  verifier(await jour.locator('.total-personne', { hasText: 'Personne A' }).locator('.objectif').first().isVisible(), 'pastille de position par rapport à l’objectif');
  verifier(await largeurOk(page), 'quand manger quoi : pas plus large que l’écran');
  await page.screenshot({ path: `${OUT}/nutrition-2-jours.png`, fullPage: true });

  // 7. Bibliothèque : étiquettes libres et filtre nutritionnel.
  await page.goto(`${URL}#/recettes`);
  await page.locator('.liste-recettes .etiquette', { hasText: 'lunchbox' }).waitFor();
  await page.getByLabel('Étiquette nutritionnelle').selectOption('pauvre-sel');
  const nb = await page.locator('.liste-recettes li').count();
  verifier(nb >= 0 && nb < 7 || (await page.getByText('Aucune recette ne correspond.').isVisible()), `filtre « pauvre en sel » : ${nb} recette(s) sur 7`);

  // 8. Export de la bibliothèque.
  await page.goto(`${URL}#/reglages`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter la bibliothèque (pour Claude)' }).click()]);
  const e = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const muj = e.recettes.find((r) => r.recette.id === 'mujaddara');
  verifier(e.format === 'batch-cooking-bibliotheque' && e.recettes.length === 7, 'export : 7 recettes complètes');
  verifier(muj.saisons.includes('printemps') && muj.recette.tags.libres.includes('lunchbox'), 'export : saisons et étiquettes modifiées');
  verifier(muj.nutrition && typeof muj.nutrition.parPortion.kcal.min === 'number' && /Etalab/.test(e.sourceNutrition.licence), 'export : nutrition par portion et source Ciqual');
  verifier(!JSON.stringify(e).includes('1650'), 'export : aucun objectif personnel');

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte')].some((el) => el.scrollWidth > el.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
