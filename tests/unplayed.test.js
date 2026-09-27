import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { silentLogger } from '../src/lib/log.js';
import { processGames, runProcess } from '../src/process/index.js';

const annotation = (extra = {}) => ({ game: 'Game', status: 'Unplayed', rating: null, tags: [], ...extra });
const row = (platform, hoursPlayed, game = 'Game') => ({
  game,
  platform,
  hoursPlayed,
  lastPlayed: '2026-09-01',
  id: platform,
  url: null,
});

test('Unplayed rejects nonzero corrected playtime on every platform, even when unrated', () => {
  assert.throws(
    () => processGames([row('Steam', 4), row('PS5', 2, 'Alias')], [annotation({ aliases: ['Alias'] })]),
    /Unplayed.*Steam[\s\S]*Unplayed.*PS5/,
  );
  assert.throws(
    () => processGames([row('Steam', 0)], [annotation({ playtime: { Steam: { hoursPlayed: 2 } } })]),
    /Unplayed.*Steam/,
  );
});

test('Unplayed accepts zero or unknown hours, applies explicit corrections and excludes even rated entries', () => {
  for (const rating of [null, 7]) {
    const result = processGames(
      [row('Steam', 20), row('GOG', null)],
      [annotation({ rating, playtime: { Steam: { hoursPlayed: 0 } } })],
    );
    assert.deepEqual(result.games, []);
    assert.deepEqual(result.unrated, []);
  }
  assert.deepEqual(processGames([row('Steam', 0)], [annotation()]).games, []);
});

test('invalid Unplayed data leaves annotations and output files untouched', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-unplayed-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    unannotatedFile: path.join(dir, 'unannotated.json'),
    log: silentLogger,
  };
  await fs.writeJson(options.input, [row('Steam', 3), row('Steam', 1, 'New')]);
  await fs.writeJson(options.annotationsFile, [annotation()]);
  await fs.writeJson(options.tagsFile, {});
  await fs.writeJson(options.out, ['existing output']);
  await fs.writeJson(options.unannotatedFile, ['existing stubs']);
  await assert.rejects(runProcess(options), /Unplayed.*Steam/);
  assert.deepEqual(await fs.readJson(options.annotationsFile), [annotation()]);
  assert.deepEqual(await fs.readJson(options.out), ['existing output']);
  assert.deepEqual(await fs.readJson(options.unannotatedFile), ['existing stubs']);
});
