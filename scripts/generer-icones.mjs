// Génère les icônes PNG de la PWA à partir de public/icons/icon.svg (Chromium via Playwright).
import { createRequire } from 'node:module';
// Playwright est préinstallé globalement dans l'environnement de dev (NODE_PATH) ; sinon : npm i -D playwright.
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const navigateur = await chromium.launch();
const page = await navigateur.newPage();
for (const [nom, taille, marge] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1]]) {
  await page.setViewportSize({ width: taille, height: taille });
  const interieur = taille * (1 - 2 * marge);
  await page.setContent(`<body style="margin:0;background:#2f5d50;display:grid;place-items:center;height:${taille}px">
    <div style="width:${interieur}px;height:${interieur}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await page.screenshot({ path: new URL(`../public/icons/${nom}`, import.meta.url).pathname });
}
await navigateur.close();
console.log('Icônes générées.');
