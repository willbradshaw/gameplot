import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAnnotations, loadGogAnnotations, loadRawGames } from '../src/process/loaders.js';

const collect = () => {
  const warnings = [];
  return { log: { warn: (m) => warnings.push(m), info() {}, debug() {} }, warnings };
};

async function tmpJson(data) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameplot-'));
  const file = path.join(dir, 'f.json');
  await writeFile(file, JSON.stringify(data));
  return file;
}

test('raw loader nulls implausible early dates with a warning', async () => {
  const file = await tmpJson([{ game: 'Half-Life', platform: 'Steam', lastPlayed: '1970-01-02', hoursPlayed: 5.9, id: 70, url: 'u' }]);
  const { log, warnings } = collect();
  const [g] = await loadRawGames(file, log);
  assert.equal(g.lastPlayed, null);
  assert.equal(warnings.length, 1);
});

test('raw loader rejects duplicate names and duplicate ids', async () => {
  const row = { game: 'A', platform: 'Steam', lastPlayed: null, hoursPlayed: 1, id: 1, url: null };
  assert.rejects(loadRawGames(await tmpJson([row, row]), collect().log), /Duplicate game names/);
  assert.rejects(loadRawGames(await tmpJson([row, { ...row, game: 'B' }]), collect().log), /Duplicate id/);
});

test('gog annotation loader coerces numeric strings with a warning', async () => {
  const file = await tmpJson([{ game: 'Shardlight', lastPlayed: '2019-01-01', hoursPlayed: '8' }]);
  const { log, warnings } = collect();
  const [g] = await loadGogAnnotations(file, log);
  assert.equal(g.hoursPlayed, 8);
  assert.match(warnings[0], /coerced/);
});

test('annotation loader translates legacy override keys', async () => {
  const file = await tmpJson([{ game: 'G', rating: 8, status: 'Complete', tags: [], hoursPlayedTotal: 100, lastPlayedTotal: '2009-01-01' }]);
  const { log, warnings } = collect();
  const [a] = await loadAnnotations(file, log);
  assert.equal(a.hoursPlayedOverride, 100);
  assert.equal(a.lastPlayedOverride, '2009-01-01');
  assert.equal('hoursPlayedTotal' in a, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /legacy override keys/);
});

test('annotation loader rejects unknown statuses and unknown keys', async () => {
  const bad = await tmpJson([{ game: 'G', rating: 8, status: 'Playing', tags: [], notes: 'x' }]);
  await assert.rejects(loadAnnotations(bad, collect().log), /status.*must be one of[\s\S]*notes.*unexpected/);
});

test('malformed JSON names the file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameplot-'));
  const file = path.join(dir, 'broken.json');
  await writeFile(file, '{ not json');
  await assert.rejects(loadAnnotations(file, collect().log), /Invalid JSON in .*broken\.json/);
});
