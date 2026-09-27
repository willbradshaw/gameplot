import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadDotEnv, saveEnvVar } from '../src/lib/env.js';

const tmpEnv = async (contents) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameplot-env-'));
  const file = path.join(dir, '.env');
  if (contents !== undefined) await writeFile(file, contents);
  return file;
};

test('saveEnvVar creates the file with owner-only permissions', async () => {
  const file = await tmpEnv();
  await saveEnvVar('GP_TEST_NEW', 'abc', file);
  assert.equal(await readFile(file, 'utf8'), 'GP_TEST_NEW=abc\n');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(process.env.GP_TEST_NEW, 'abc');
});

test('saveEnvVar replaces an existing assignment and leaves other lines alone', async () => {
  const file = await tmpEnv('# comment\nA=1\nexport B=old\nC=3\n');
  await saveEnvVar('B', 'new', file);
  assert.equal(await readFile(file, 'utf8'), '# comment\nA=1\nB=new\nC=3\n');
});

test('saveEnvVar appends when the variable is absent, even without a trailing newline', async () => {
  const file = await tmpEnv('A=1');
  await saveEnvVar('B', '2', file);
  assert.equal(await readFile(file, 'utf8'), 'A=1\nB=2\n');
});

test('saveEnvVar does not match variables that merely share a prefix', async () => {
  const file = await tmpEnv('PSN_NPSSO_UK=uk\n');
  await saveEnvVar('PSN_NPSSO', 'plain', file);
  assert.equal(await readFile(file, 'utf8'), 'PSN_NPSSO_UK=uk\nPSN_NPSSO=plain\n');
});

test('loadDotEnv returns false for a missing file and loads an existing one', async () => {
  assert.equal(loadDotEnv(path.join(os.tmpdir(), 'definitely-missing.env')), false);
  const file = await tmpEnv('GP_TEST_LOADED=yes\n');
  assert.equal(loadDotEnv(file), true);
  assert.equal(process.env.GP_TEST_LOADED, 'yes');
});
