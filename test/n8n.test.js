import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildN8n } from '../scripts/build-n8n.js';
import { checkLeads } from '../src/index.js';

const code = readFileSync(new URL('../dist/n8n-code-node.js', import.meta.url), 'utf8');
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/leads.json', import.meta.url), 'utf8'));

test('dist/n8n-code-node.js is up to date with src/ (run npm run build)', () => {
  assert.equal(code, buildN8n());
});

test('the Code node gives the same answers as the library', () => {
  // n8n wraps Code node scripts in a function and provides $input. Do the same here.
  const items = fixtures.map((f) => ({ json: f.input }));
  const runCodeNode = new Function('$input', code.replace('allowReserved: false', 'allowReserved: true'));
  const output = runCodeNode({ all: () => items });

  const expected = checkLeads(items.map((i) => i.json), { allowReserved: true });
  assert.equal(output.length, items.length);
  output.forEach((item, i) => {
    assert.deepEqual(item.json.intake, expected[i]);
    assert.deepEqual(item.pairedItem, { item: i });
    assert.equal(item.json.first_name, items[i].json.first_name, 'original fields stay on the item');
  });
});
