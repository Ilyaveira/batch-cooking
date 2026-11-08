// Parcours mobile (Pixel 7) : modifier le texte d'une étape, scinder, fusionner, séparer.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/edition-mobile.cjs
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
  const lignes = page.locator('.ligne-reorganisation');
  const attendreTexte = (n, t) =>
    page
      .waitForFunction(([n, t]) => document.querySelectorAll('.ligne-reorganisation')[n - 1]?.textContent.includes(t), [n, t], { timeout: 5000 })
      .catch(async (e) => {
        await page.screenshot({ path: `${OUT}/edition-echec.png` });
        console.log('Ligne', n, ':', (await lignes.nth(n - 1).innerText()).slice(0, 200));
        console.log('Alerte :', await page.locator('[role=alert]').allInnerTexts());
        throw e;
      });

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();
  await page.goto(`${URL}#/semaine/1/session`);
  await page.getByRole('button', { name: 'Réorganiser' }).click();

  // 1. Modifier le texte de l'étape 2 (consigne + un sous-point).
  await page.getByRole('button', { name: 'Modifier l’étape 2', exact: true }).click();
  await page.getByLabel('Texte de l’étape').fill('Grande casserole d’**eau salée** à bouillir.\n- Couvercle pour aller plus vite');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await attendreTexte(2, 'Couvercle pour aller plus vite');
  verifier((await lignes.nth(1).locator('strong').first().innerText()) === 'eau salée', 'texte modifié, ingrédient en gras, sous-point ajouté');

  // 2. Texte vide refusé.
  await page.getByRole('button', { name: 'Modifier l’étape 3', exact: true }).click();
  await page.getByLabel('Texte de l’étape').fill('- seulement un sous-point');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText(/ne peut pas être vide/).waitFor();
  await page.getByRole('button', { name: 'Annuler' }).click();
  verifier(true, 'consigne vide refusée');

  // 3. Scinder l'étape 14 (écaler / marinade).
  const n14 = (await lignes.nth(13).innerText()).includes('Écale les œufs');
  verifier(n14, 'n° 14 = écaler les œufs + marinade');
  await page.getByRole('button', { name: 'Modifier l’étape 14', exact: true }).click();
  await page.getByRole('button', { name: 'Scinder en deux' }).click();
  verifier((await page.getByLabel(/1ʳᵉ partie/).inputValue()) === 'Écale les œufs.', 'coupure proposée après la 1ʳᵉ phrase');
  await page.getByRole('button', { name: 'Valider la scission' }).click();
  await attendreTexte(15, 'Marinade');
  verifier((await page.getByLabel('Heure de l’étape 15').inputValue()) === '1:15', '2ᵉ partie en n° 15, à la même heure (1:15)');
  verifier((await lignes.count()) === 24, '24 étapes après la scission');

  // 4. Fusionner lentilles (n° 3) et riz (n° 4).
  await page.getByRole('button', { name: 'Fusionner l’étape 3 avec la suivante' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ligne-reorganisation').length === 23);
  const carte = await lignes.nth(2).innerText();
  verifier(carte.includes('320 g de lentilles') && carte.includes('240 g de riz'), 'fusion : une seule carte lentilles + riz');
  verifier((await page.getByLabel('Heure de l’étape 3').inputValue()) === '0:05', 'fusion à l’heure de la 1ʳᵉ (0:05)');
  await page.screenshot({ path: `${OUT}/edition-1-reorganiser.png` });

  // 5. Mode cuisine : une case, deux minuteurs.
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.goto(`${URL}#/semaine/1/cuisine`);
  const etape = page.locator('.cuisine-etape').nth(2);
  await etape.waitFor();
  const boutons = await etape.getByRole('button', { name: /min/ }).allInnerTexts();
  verifier(boutons.length === 2 && boutons[0].includes('25 min') && boutons[1].includes('12 min'), 'mode cuisine : deux minuteurs (25 et 12 min)');
  await etape.getByRole('checkbox').click();
  await page.waitForFunction(() => document.querySelectorAll('.cuisine-etape')[2]?.classList.contains('fait'));
  verifier(true, 'une seule case coche les deux étapes fusionnées');
  const textes = await page.locator('.cuisine-etape').allInnerTexts();
  verifier(textes.length === 23 && textes[12].includes('Écale les œufs.') && textes[13].includes('Marinade'), 'mode cuisine : scission affichée');
  await page.screenshot({ path: `${OUT}/edition-2-cuisine.png` });

  // 6. Export : plan valide avec groupe et étape scindée.
  await page.goto(`${URL}#/reglages`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()]);
  const etapes = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')).semaines[0].session.etapes;
  verifier(etapes.filter((e) => e.groupe === 's1-03').length === 2, 'export : fusion transportée (« groupe »)');
  verifier(etapes.some((e) => e.id === 's1-14-b'), 'export : étape scindée présente');
  verifier(etapes.find((e) => e.id === 's1-02').details[0] === 'Couvercle pour aller plus vite', 'export : texte modifié');

  // 7. Séparer, puis revenir au plan importé.
  await page.goto(`${URL}#/semaine/1/session`);
  await page.getByRole('button', { name: 'Réorganiser' }).click();
  await page.getByRole('button', { name: 'Séparer l’étape 3' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ligne-reorganisation').length === 24);
  verifier(true, 'séparer : 24 étapes');
  await page.getByRole('button', { name: 'Revenir au plan importé' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ligne-reorganisation').length === 23 && !document.body.textContent.includes('Étapes modifiées'));
  verifier(!(await lignes.nth(1).innerText()).includes('Couvercle'), 'retour au plan importé : textes d’origine');

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte')].some((e) => e.scrollWidth > e.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch(async (e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
