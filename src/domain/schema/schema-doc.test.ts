// Garde SCHEMA.md synchronisé avec le code : l'exemple et les listes doivent rester valides.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSTES, RAYONS, UNITES } from '../constantes';
import { validerPlan } from './validation';

const doc = readFileSync(resolve(__dirname, '../../../SCHEMA.md'), 'utf8');

describe('SCHEMA.md', () => {
  it('contient un exemple minimal valide', () => {
    const bloc = doc.match(/## Exemple minimal\s+```json\n([\s\S]*?)```/);
    expect(bloc).not.toBeNull();
    const r = validerPlan(bloc![1]!);
    expect(r.ok ? [] : r.erreurs).toEqual([]);
  });

  it('documente toutes les valeurs des listes fermées', () => {
    for (const v of [...RAYONS, ...UNITES, ...POSTES]) expect(doc).toContain(`\`${v}\``);
  });
});
