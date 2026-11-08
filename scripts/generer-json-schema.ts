// Génère public/schema/plan-v1.schema.json à partir du schéma Zod (source unique).
// Les contrôles croisés (références entre ids) ne sont pas exprimables en JSON Schema :
// ils sont décrits dans SCHEMA.md et vérifiés par l'app à l'import.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { planStructureSchema } from '../src/domain/schema/plan';

const sortie = resolve(import.meta.dirname, '../public/schema/plan-v1.schema.json');
const schema = {
  ...z.toJSONSchema(planStructureSchema, { target: 'draft-2020-12' }),
  title: 'Plan mensuel de batch cooking (v1)',
  description: 'Format d’échange importé par l’application Batch cooking. Voir SCHEMA.md.',
};
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, JSON.stringify(schema, null, 2) + '\n');
console.log(`JSON Schema écrit : ${sortie}`);
