// Parcours mobile (Pixel 7) : étapes liées (même ligne du planning), durées, incohérences.
// Usage : npm run build && npx vite preview --port 4173 &  puis  node tests/e2e/dependances-mobile.cjs
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
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const lignes = page.locator('.ligne-reorganisation');
  /** n° (1-based) et heure affichés de l'étape dont le texte contient `t`. */
  const etape = async (t) => {
    const textes = await lignes.allInnerTexts();
    const i = textes.findIndex((x) => x.includes(t));
    if (i < 0) return null;
    return { n: i + 1, heure: await page.getByLabel(`Heure de l’étape ${i + 1}`).inputValue() };
  };
  const attendre = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 });

  await page.goto(`${URL}#/importer`);
  await page.getByRole('button', { name: /Charger l’exemple/ }).click();
  await page.getByRole('button', { name: 'Importer ce plan' }).click();
  await page.getByText(/importé/).first().waitFor();
  await page.goto(`${URL}#/semaine/1/session`);
  await page.getByRole('button', { name: 'Réorganiser' }).click();

  // Durées et heure de fin affichées.
  const enfourne = await etape('Deux plaques');
  const ligneFour = lignes.nth(enfourne.n - 1);
  verifier((await ligneFour.locator('.fin-etape').innerText()) === '→ fin 1:27', 'enfourner : 3 min + cuisson 27 min → fin 1:27');

  // 1. Avancer « Enfourne » de 0:57 à 0:45 : retourne et sortie suivent.
  const champ = page.getByLabel(`Heure de l’étape ${enfourne.n}`);
  await champ.fill('0:45');
  await champ.press('Enter');
  await page.getByText(/2 étapes liées décalées/).waitFor();
  const retourne = await etape('Retourne les légumes');
  const sortie = await etape('Sors les plaques');
  verifier(retourne.heure === '1:01' && sortie.heure === '1:15', `retourne 1:01 et sortie 1:15 (lu : ${retourne.heure}, ${sortie.heure})`);
  const enf2 = await etape('Deux plaques');
  verifier(enf2.n < retourne.n && retourne.n < sortie.n, 'trois cartes séparées, dans l’ordre');
  await page.screenshot({ path: `${OUT}/dependances-1.png` });

  // 2. Annuler le décalage.
  await page.getByRole('button', { name: 'Annuler' }).click();
  await attendre(() => !document.body.textContent.includes('Étapes modifiées sur cet appareil.'));
  verifier((await etape('Sors les plaques')).heure === '1:27', 'Annuler : retour aux heures du plan');

  // 3. Œufs avancés de 1:02 à 0:50 : heures du texte décalées.
  const oeufs = await etape('10 œufs');
  const champOeufs = page.getByLabel(`Heure de l’étape ${oeufs.n}`);
  await champOeufs.fill('0:50');
  await champOeufs.press('Enter');
  await attendre(() => document.body.textContent.includes('À 0:56, sors-en 4'));
  verifier(true, 'œufs à 0:50 : « À 0:56, sors-en 4 … À 1:00 » dans le texte');

  // 4. Durée du four 27 → 35 : sortie à 1:35, retourne inchangé.
  const four = await etape('Deux plaques');
  const cuisson = page.getByLabel(`Minutes de cuisson de l’étape ${four.n}`);
  await cuisson.fill('35');
  await cuisson.press('Enter');
  await attendre(() => [...document.querySelectorAll('.ligne-reorganisation')].some((l) => l.textContent.includes('Sors les plaques')));
  await page.waitForFunction(
    () => {
      const ls = [...document.querySelectorAll('.ligne-reorganisation')];
      const i = ls.findIndex((l) => l.textContent.includes('Sors les plaques'));
      return i >= 0 && document.querySelector(`[aria-label="Heure de l’étape ${i + 1}"]`)?.value === '1:35';
    },
    null,
    { timeout: 5000 },
  );
  verifier((await etape('Retourne les légumes')).heure === '1:13', 'cuisson 35 min : sortie 1:35, retourne reste à 1:13');

  // 5. Incohérence : sortie placée avant la fin de la cuisson.
  const s2 = await etape('Sors les plaques');
  const champSortie = page.getByLabel(`Heure de l’étape ${s2.n}`);
  await champSortie.fill('1:20');
  await champSortie.press('Enter');
  await page.getByText(/Avant la fin de « Deux plaques/).first().waitFor();
  verifier(true, 'sortie à 1:20 : ⚠ avant la fin de la cuisson (1:35)');
  await page.screenshot({ path: `${OUT}/dependances-2.png` });

  // 6. Mode cuisine : cartes séparées et triées ; minuteur du four = 38 min.
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.goto(`${URL}#/semaine/1/cuisine`);
  await page.locator('.cuisine-etape').first().waitFor();
  const heures = (await page.locator('.cuisine-etape .heure').allInnerTexts()).map((h) => {
    const [a, m] = h.split(':').map(Number);
    return a * 60 + m;
  });
  verifier(heures.every((h, i) => i === 0 || h >= heures[i - 1]), 'mode cuisine : étapes dans l’ordre chronologique');
  const textes = await page.locator('.cuisine-etape').allInnerTexts();
  const iFour = textes.findIndex((t) => t.includes('Deux plaques'));
  verifier(textes[iFour].includes('Minuteur 38 min'), 'minuteur du four : 3 + 35 = 38 min');
  verifier(
    iFour < textes.findIndex((t) => t.includes('Retourne les légumes')) && !textes[iFour].includes('Sors les plaques'),
    'enfourner, retourner et sortir restent des cartes séparées',
  );

  const deborde = await page.evaluate(() => [...document.querySelectorAll('.contenu, .carte, .cuisine')].some((e) => e.scrollWidth > e.clientWidth + 1));
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(erreurs.length === 0, `aucune erreur console (${erreurs.join(' | ')})`);
  await b.close();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
