// Parcours mobile (Pixel 7) : modifier les ingrédients (quantité pour la semaine, remplacement
// pour le mois avec création d'un ingrédient, infos d'un ingrédient, ajout, export).
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/ingredients-mobile.cjs
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
  const page = await (await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', acceptDownloads: true })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const quantiteCourses = async (nom) => {
    const l = page.locator('.ligne-avec-edition', { has: page.locator('.ligne-courses > span:first-child', { hasText: new RegExp(`^${nom}$`) }) }).first();
    return (await l.count()) ? (await l.locator('.quantite').innerText()).trim() : null;
  };

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();

  // 1. Feta 150 → 120 g pour la salade, cette semaine seulement.
  await page.goto(`${URL}#/`);
  await page.getByRole('link', { name: 'Salade de lentilles, butternut et feta' }).click();
  await page.getByRole('button', { name: /Modifier les ingrédients/ }).click();
  await page.getByLabel('Quantité de Feta').fill('120');
  verifier(await page.getByLabel(/Cette semaine seulement \(semaine 1\)/).isChecked(), 'portée par défaut : cette semaine seulement');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Modifiée pour la semaine 1 seulement.').waitFor();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByText('Ingrédients modifiés pour la semaine 1.').waitFor();
  const feta = await page.locator('.liste-ingredients li', { hasText: 'Feta' }).innerText();
  verifier(feta.includes('120 g'), 'fiche : feta 120 g, bandeau « modifiés pour la semaine 1 »');
  await page.goto(`${URL}#/semaine/1/courses`);
  await page.getByText('Fruits et légumes').waitFor();
  verifier((await quantiteCourses('Feta')) === '370 g', 'courses semaine 1 : feta 400 → 370 g');

  // 2. Remplacer la butternut par du potimarron (créé), pour tout le mois et toutes les recettes.
  await page.goto(`${URL}#/recettes/sheet-pan-poulet-butternut?semaine=1`);
  await page.getByRole('button', { name: /Modifier les ingrédients/ }).click();
  await page.getByRole('button', { name: 'Remplacer Butternut' }).click();
  await page.getByLabel('Remplacer par').fill('potimarron');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.locator('.liste-edition strong', { hasText: 'Potimarron' }).waitFor();
  await page.getByLabel(/Tout le mois/).check();
  await page.getByLabel(/Remplacer aussi dans les autres recettes du mois/).check();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText(/Remplacé aussi dans : Salade de lentilles/).waitFor();
  verifier(await page.getByText(/Les étapes de session citent encore « Butternut »/).isVisible(), 'avertissement : les étapes citent encore « Butternut »');
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.goto(`${URL}#/semaine/1/courses`);
  await page.getByText('Fruits et légumes').waitFor();
  verifier((await quantiteCourses('Butternut')) === null && (await quantiteCourses('Potimarron')) === '1,3 kg', 'courses : butternut remplacée par potimarron 1,3 kg (salade comprise)');
  verifier((await quantiteCourses('Feta')) === '370 g', 'la modification de la semaine (feta 120 g) est conservée');

  // 3. Infos d'un ingrédient depuis « à sortir » : lait de coco rangé au frigo.
  await page.goto(`${URL}#/semaine/1/session`);
  await page.getByRole('button', { name: 'Modifier Lait de coco' }).click();
  await page.getByLabel('Rangé à la maison').selectOption('frigo');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const frigo = page.locator('div', { has: page.getByRole('heading', { name: 'Frigo', exact: true }) }).last();
  await frigo.getByText('Lait de coco').waitFor();
  verifier(true, '« à sortir » : lait de coco déplacé au frigo');

  // 4. Depuis les courses : renommer et changer le rayon des tomates séchées.
  await page.goto(`${URL}#/semaine/1/courses`);
  await page.getByRole('button', { name: 'Modifier Tomates séchées' }).first().click();
  verifier(await page.getByRole('link', { name: 'Cake salé tomates séchées et feta' }).isVisible(), 'courses : lien vers la recette d’origine pour changer la quantité');
  await page.getByLabel('Rayon du magasin').selectOption('cremerie');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const cremerie = page.locator('section.carte', { has: page.getByRole('heading', { name: 'Crèmerie' }) });
  await cremerie.getByText('Tomates séchées').first().waitFor();
  verifier(true, 'courses : tomates séchées passées au rayon crèmerie');
  await page.screenshot({ path: `${OUT}/ingredients-1-courses.png` });

  // 5. Ajouter un citron aux crudités (mois).
  await page.goto(`${URL}#/recettes/crudites-apero?semaine=1`);
  await page.getByRole('button', { name: /Modifier les ingrédients/ }).click();
  await page.getByRole('button', { name: '+ Ajouter un ingrédient' }).click();
  await page.getByLabel('Ingrédient à ajouter').fill('citron');
  await page.getByRole('button', { name: 'Citrons jaunes' }).click();
  await page.getByLabel('Quantité de Citrons jaunes').fill('1');
  await page.getByLabel('Unité de Citrons jaunes').selectOption('piece');
  await page.getByLabel(/Tout le mois/).check();
  await page.screenshot({ path: `${OUT}/ingredients-2-editeur.png` });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText(/Modifiée pour tout le mois/).waitFor();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.goto(`${URL}#/semaine/1/courses`);
  await page.getByText('Fruits et légumes').waitFor();
  verifier((await quantiteCourses('Citrons jaunes')) === '2 ½', 'courses : citrons 1 ½ → 2 ½');

  // 6. Quantité invalide refusée.
  await page.goto(`${URL}#/recettes/crudites-apero?semaine=1`);
  await page.getByRole('button', { name: /Modifier les ingrédients/ }).click();
  await page.getByLabel('Quantité de Radis').fill('-2');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText(/quantité attendue supérieure à 0/).waitFor();
  verifier(true, 'quantité négative refusée avec un message');
  await page.getByRole('button', { name: 'Annuler' }).click();

  // 7. Export : plan valide avec recette dérivée et ingrédient créé.
  await page.goto(`${URL}#/reglages`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()]);
  const e = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  verifier(e.semaines[0].plats[0].recette === 'salade-lentilles-butternut-feta-s1', 'export : modification de la semaine en recette dérivée « -s1 »');
  verifier(e.ingredients.some((i) => i.id === 'potimarron') && e.ingredients.find((i) => i.id === 'lait-coco').stockage === 'frigo', 'export : potimarron créé, lait de coco au frigo');

  // 8. Revenir à la recette du plan (semaine).
  await page.goto(`${URL}#/recettes/salade-lentilles-butternut-feta?semaine=1`);
  await page.getByRole('button', { name: 'Revenir à la recette du plan' }).click();
  await page.getByText('Ingrédients modifiés pour tout le mois.').waitFor();
  verifier((await page.locator('.liste-ingredients li', { hasText: 'Feta' }).innerText()).includes('150 g'), 'revenir : la version du mois s’applique (feta 150 g, potimarron)');

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte')].some((el) => el.scrollWidth > el.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
