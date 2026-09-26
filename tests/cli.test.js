/**
 * Smoke tests: the CLI loads, wires up, and answers --help. These catch
 * broken imports and misregistered commands, which the unit tests (which
 * import modules directly) would not.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'gameplot.js');
const run = (...args) => promisify(execFile)(process.execPath, [BIN, ...args]);

test('gameplot --help lists the scrape command', async () => {
  const { stdout } = await run('--help');
  assert.match(stdout, /scrape\s+download online playtime data/);
});

test('gameplot scrape --help lists the platforms', async () => {
  const { stdout } = await run('scrape', '--help');
  assert.match(stdout, /psn \[options\]\s+download from PlayStation Network/);
  assert.match(stdout, /steam \[options\]\s+download from Steam/);
});

test('gameplot scrape steam --help shows its default output file', async () => {
  const { stdout } = await run('scrape', 'steam', '--help');
  assert.match(stdout, /default: data\/raw\/steam\.json/);
  assert.match(stdout, /--label <label>[\s\S]*default:\s+"Steam"/);
});

test('gameplot scrape psn --help documents the account option', async () => {
  const { stdout } = await run('scrape', 'psn', '--help');
  assert.match(stdout, /--suffix <suffix>/);
  assert.match(stdout, /--label <label>[\s\S]*default:\s+"PS5"/);
  assert.match(stdout, /default: data\/raw\/psn\.json/);
});

test('an invalid suffix is rejected before any network access', async () => {
  await assert.rejects(run('scrape', 'psn', '--suffix', 'a/b'), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /letters, digits or dashes/);
    return true;
  });
});

test('unknown commands exit non-zero with usage', async () => {
  await assert.rejects(run('frobnicate'), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /unknown command/);
    return true;
  });
});
