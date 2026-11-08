// Valide un fichier de plan en ligne de commande : npm run valider -- chemin/plan.json
import { readFileSync } from 'node:fs';
import { validerPlan } from '../src/domain/schema/validation';

const chemin = process.argv[2];
if (!chemin) {
  console.error('Usage : npm run valider -- chemin/vers/plan.json');
  process.exit(2);
}
const r = validerPlan(readFileSync(chemin, 'utf8'));
if (!r.ok) {
  console.error(`✗ ${r.erreurs.length} erreur(s) :`);
  for (const e of r.erreurs) console.error(`  - ${e.chemin} : ${e.message}`);
  process.exit(1);
}
console.log(`✓ Plan valide : « ${r.plan.titre} », ${r.plan.semaines.length} semaine(s), ${r.plan.recettes.length} recette(s).`);
for (const a of r.avertissements) console.log(`  ⚠ ${a.chemin} : ${a.message}`);
