import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/replay.js', import.meta.url));
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/leads.json', import.meta.url), 'utf8'));

test('replay posts every replayable fixture and nothing else', async () => {
  const received = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ id: req.headers['x-lead-fixture'], body: JSON.parse(body) });
      res.end('ok');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const { stdout } = await run(process.execPath, [cli, '--url', `http://127.0.0.1:${port}/hook`, '--delay', '0']);
    const replayable = fixtures.filter((f) => f.replay !== false);
    assert.deepEqual(received.map((r) => r.id), replayable.map((f) => f.id));
    assert.deepEqual(received[0].body, replayable[0].input);
    assert.match(stdout, new RegExp(`Sent ${replayable.length} leads`));
  } finally {
    server.close();
  }
});

test('replay refuses plain http to anything but localhost', async () => {
  await assert.rejects(run(process.execPath, [cli, '--url', 'http://hooks.example.com/lead']), /Use an https:\/\/ URL/);
});
