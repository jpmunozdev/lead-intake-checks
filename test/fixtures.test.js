import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLead, checkLeads } from '../src/index.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/leads.json', import.meta.url), 'utf8'));
// Fixtures use fiction-reserved numbers and example domains, so accept them unless a fixture says otherwise.
const optionsFor = (fixture) => ({ allowReserved: true, ...fixture.options });

test('fixture ids are unique', () => {
  const ids = fixtures.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const fixture of fixtures) {
  test(`fixture: ${fixture.id}`, () => {
    const result = checkLead(fixture.input, optionsFor(fixture));
    const { expect } = fixture;
    assert.equal(result.status, expect.status);
    assert.deepEqual(result.issues.map((i) => i.code).sort(), [...expect.issues].sort());
    for (const [key, value] of Object.entries(expect.lead ?? {})) assert.equal(result.lead[key], value, `lead.${key}`);
    for (const [key, value] of Object.entries(expect.channels ?? {})) assert.equal(result.channels[key], value, `channels.${key}`);
    if (expect.tags) assert.deepEqual(result.tags, expect.tags);
  });
}

test('a batch flags the repeat of an earlier lead by phone and email', () => {
  const results = checkLeads(fixtures.map((f) => f.input), { allowReserved: true });
  const first = fixtures.findIndex((f) => f.id === 'clean-web-form');
  const repeat = fixtures.findIndex((f) => f.id === 'repeat-of-clean-web-form');
  const duplicate = results[repeat].issues.find((i) => i.code === 'lead_duplicate');
  assert.deepEqual(duplicate.matches, [{ kind: 'phone', index: first }, { kind: 'email', index: first }]);
  assert.equal(results[repeat].status, 'review');
  assert.ok(results[repeat].tags.includes('possible-duplicate'));
  const others = results.filter((r, i) => i !== repeat && r.issues.some((x) => x.code === 'lead_duplicate'));
  assert.equal(others.length, 0, 'no other fixture should look like a duplicate');
});

// The replay tool posts fixtures to a live workflow. This keeps every replayable fixture unable to reach a
// real person: phones stay in the 555-0100 to 555-0199 fiction range (or Ofcom's 020 7946 0xxx drama range,
// or are one repeated digit), and emails stay on example domains or reserved TLDs. Checked here on its own
// terms, not with the library under test.
test('replayable fixtures cannot reach a real person', () => {
  const strings = (value) => (value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [String(value ?? '')]);
  for (const fixture of fixtures.filter((f) => f.replay !== false)) {
    for (const text of strings(fixture.input)) {
      for (const token of text.split(/[\s,;<>]+/).filter((t) => t.includes('@'))) {
        const domain = token.slice(token.lastIndexOf('@') + 1).toLowerCase().replace(/[^a-z0-9.-]/g, '');
        const safe = /^example\.(com|net|org)$/.test(domain) || /\.(test|example|invalid|localhost)$/.test(domain) || !domain.includes('.');
        assert.ok(safe, `${fixture.id}: ${token} could be a real inbox`);
      }
      const digits = text.replace(/\D/g, '');
      if (digits.length >= 7) {
        const safe = /55501\d\d/.test(digits) || /2079460\d{3}/.test(digits) || /^(\d)\1+$/.test(digits);
        assert.ok(safe, `${fixture.id}: ${text} could be a real phone`);
      }
    }
  }
});
