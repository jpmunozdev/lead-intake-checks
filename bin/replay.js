#!/usr/bin/env node
// Post the fixture leads to a webhook, one at a time, so you can watch how a live workflow handles each.
// Fixtures that use real domains (typo and placeholder examples) are skipped, so nothing reaches a real person.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = `Usage: lead-replay --url <webhook url> [options]

  --url <url>       Webhook to post to. https, or http on localhost.
  --file <path>     Fixtures file (default: fixtures/leads.json)
  --only <ids>      Comma-separated fixture ids to send
  --delay <ms>      Wait between leads (default: 1000)
  --dry-run         List what would be sent without sending
  -h, --help        Show this help`;

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    file: { type: 'string', default: fileURLToPath(new URL('../fixtures/leads.json', import.meta.url)) },
    only: { type: 'string' },
    delay: { type: 'string', default: '1000' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const dryRun = values['dry-run'];
if (!values.url && !dryRun) {
  console.error(USAGE);
  process.exit(1);
}
if (values.url) {
  const url = new URL(values.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    console.error('Use an https:// URL. Plain http:// is only allowed for localhost.');
    process.exit(1);
  }
}

const all = JSON.parse(await readFile(values.file, 'utf8'));
const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
const picked = all.filter((f) => !only || only.has(f.id));
const leads = picked.filter((f) => f.replay !== false);
const delay = Number(values.delay);

let failed = 0;
for (const [n, fixture] of leads.entries()) {
  if (dryRun) {
    console.log(`would send  ${fixture.id}`);
    continue;
  }
  try {
    const response = await fetch(values.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lead-fixture': fixture.id },
      body: JSON.stringify(fixture.input),
    });
    if (!response.ok) failed++;
    console.log(`${response.status}  ${fixture.id}`);
  } catch (error) {
    failed++;
    console.log(`ERR  ${fixture.id}  ${error.message}`);
  }
  if (n < leads.length - 1) await new Promise((resolve) => setTimeout(resolve, delay));
}

const skipped = picked.length - leads.length;
console.log(`\n${dryRun ? 'Would send' : 'Sent'} ${leads.length} leads${skipped ? `, skipped ${skipped} that use real domains or a platform-only shape` : ''}.`);
if (failed) {
  console.log(`${failed} failed.`);
  process.exit(1);
}
