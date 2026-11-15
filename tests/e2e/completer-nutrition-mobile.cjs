// Parcours mobile (Pixel 7) : « Compléter la nutrition » sur un plan sans codes Ciqual ni féculents
// (comme un plan produit avant la mise à jour de la skill) : propositions, féculent proposé,
// masse d'une unité, enregistrement groupé, effet sur la fiche recette.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/completer-nutrition-mobile.cjs
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
  const plan = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/novembre-2026-semaine1.json'), 'utf8'));
  for (const i of plan.ingredients) {
    delete i.ciqual;
    delete i.feculent;
  }
  const b = await chromium.launch();
  const page = await (await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));

  await page.goto(`${URL}#/importer`);
  await page.getByLabel('… ou coller le JSON').fill(JSON.stringify(plan));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();

  // Depuis la fiche : bandeau détaillé → lien vers l'assistant.
  await page.goto(`${URL}#/recettes/mujaddara?semaine=1`);
  const bandeau = page.locator('.bandeau-info', { hasText: 'Calcul incomplet' });
  verifier(/\d+ ingrédients? sans aliment Ciqual ou sans masse d’unité/.test(await bandeau.innerText()), 'bandeau : nombre d’ingrédients sans aliment ou sans masse');
  await bandeau.getByRole('link', { name: 'compléter la nutrition' }).first().click();
  await page.getByRole('heading', { name: 'Compléter la nutrition' }).waitFor();
  const nombre = async () => Number(/\((\d+)\)/.exec(await page.getByRole('heading', { name: /Aliment ou masse à compléter/ }).innerText())[1]);
  const avant = await nombre();
  verifier(avant > 30, `ingrédients à compléter : ${avant}`);
  const coches = await page.locator('.ligne-completer input[type=radio]:checked').evaluateAll((l) => l.map((i) => i.closest('label').innerText));
  verifier(coches.length > 0 && coches.every((t) => t.startsWith('Aucun')), 'aucun aliment présélectionné (état actuel « Aucun »)');

  // Lentilles : la proposition « sèche » coche « féculent », avec sa raison.
  const lentilles = page.getByRole('group', { name: 'Lentilles vertes' });
  await lentilles.getByRole('radio', { name: /Lentille verte, sèche/ }).check();
  verifier(await lentilles.getByRole('checkbox', { name: /Féculent/ }).isChecked(), 'féculent pré-coché pour les lentilles');
  verifier(await lentilles.getByText(/proposé car : légumineuses/).isVisible(), 'raison affichée : légumineuses');

  // Riz : féculent proposé aussi ; cottage cheese : recherche « Autre aliment… ».
  await page.getByRole('group', { name: 'Riz basmati' }).getByRole('radio', { name: /Riz thaï ou basmati, cru/ }).check();
  const cottage = page.getByRole('group', { name: 'Cottage cheese' });
  await cottage.getByRole('button', { name: 'Autre aliment…' }).click();
  await cottage.getByLabel('Chercher dans Ciqual').fill('fromage frais nature');
  await cottage.getByRole('list', { name: /Résultats/ }).getByRole('button').first().click();
  verifier((await cottage.locator('input[type=radio]:checked').count()) === 1, 'cottage cheese : aliment choisi par la recherche');
  verifier(!(await cottage.getByRole('checkbox', { name: /Féculent/ }).isChecked()), 'pas de féculent proposé pour un fromage');

  // Œufs : aliment, puis masse moyenne USDA proposée (« 1 large » = 50 g), acceptée d'un geste.
  const oeufs = page.getByRole('group', { name: 'Œufs' });
  verifier(/Manque : aliment Ciqual ; masse « pièce »/.test(await oeufs.innerText()), 'œufs : « manque : aliment Ciqual ; masse « pièce » »');
  verifier(!(await oeufs.getByRole('button', { name: /g \(1 large\)/ }).count()), 'pas de masse proposée tant que l’aliment n’est pas choisi');
  await oeufs.getByRole('radio', { name: 'Oeuf cru' }).check();
  verifier(await oeufs.getByText(/Masses moyennes USDA \(Egg, whole, raw, fresh\)/).isVisible(), 'masses moyennes USDA proposées, avec l’aliment USDA');
  await oeufs.getByRole('button', { name: '50 g (1 large)' }).click();
  verifier((await oeufs.getByLabel(/Masse d’une unité « pièce » \(g\)/).inputValue()) === '50', 'proposition acceptée : 50 g par pièce');

  // Cumin : « quantité négligeable, ne pas compter ».
  await page.getByRole('group', { name: 'Cumin' }).getByLabel(/Quantité négligeable/).check();
  await page.screenshot({ path: `${OUT}/completer-1.png`, fullPage: false });
  await page.getByRole('button', { name: /Enregistrer les choix \(5\)/ }).click();
  await page.getByText('5 ingrédients enregistrés pour tous les mois.').waitFor();
  verifier((await nombre()) === avant - 5, `les 5 ingrédients quittent « à compléter » (${avant} → ${avant - 5})`);

  // Fiche : ingrédients comptés, cumin « non compté par choix ».
  await page.goto(`${URL}#/recettes/mujaddara?semaine=1`);
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Nutrition par portion' }) });
  await section.locator('table').waitFor();
  const texte = await section.innerText();
  verifier(!/Lentilles vertes : /.test(texte) && !/Œufs : /.test(texte) && !/Cottage cheese : /.test(texte) && !/Cumin : /.test(texte), 'fiche : lentilles, œufs, cottage cheese comptés ; cumin plus signalé');
  verifier(/Non comptés par choix \(quantité négligeable\) : Cumin/.test(texte), 'fiche : « non comptés par choix : Cumin »');

  // Le marquage « féculent » et la masse sont mémorisés (section repliée de l'assistant).
  await page.goto(`${URL}#/nutrition`);
  await page.getByText(/Complets ou non comptés par choix/).click();
  const lent = page.getByRole('group', { name: 'Lentilles vertes' });
  verifier(
    (await lent.getByRole('checkbox', { name: /Féculent/ }).isChecked()) &&
      (await page.getByRole('group', { name: 'Riz basmati' }).getByRole('checkbox', { name: /Féculent/ }).isChecked()),
    'lentilles et riz enregistrés comme féculents',
  );
  verifier(/actuelle : 50 g/.test(await page.getByRole('group', { name: 'Œufs' }).innerText()), 'œufs : masse actuelle 50 g');

  const large = await page.evaluate(() => window.innerWidth <= screen.width && document.documentElement.scrollWidth <= window.innerWidth);
  verifier(large, 'pas plus large que l’écran');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
