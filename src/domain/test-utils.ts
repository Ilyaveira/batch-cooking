// Aides partagées par les tests du domaine.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plan } from './schema/plan';
import { validerPlan } from './schema/validation';

export function fixtureBrute(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, '../../fixtures/novembre-2026-semaine1.json'), 'utf8'));
}

export function fixturePlan(): Plan {
  const r = validerPlan(fixtureBrute());
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs, null, 2));
  return r.plan;
}
