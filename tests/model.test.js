import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { parseOrThrow, rawGameSchema, rawGamesSchema } from '../src/lib/model.js';
import { buildGame } from '../src/process/index.js';

const row = (over = {}) => ({
  game: 'A',
  platform: 'Xbox',
  lastPlayed: '2024-01-02',
  hoursPlayed: 1.5,
  id: '123',
  url: '',
  ...over,
});

test('accepts a well-formed raw game and normalises empty url to null', () => {
  const g = rawGameSchema.parse(row());
  assert.equal(g.url, null);
  assert.equal(g.hoursPlayed, 1.5);
});

test('rejects bad dates, string hours, empty platforms and extra keys', () => {
  const r = rawGameSchema.safeParse(
    row({ lastPlayed: 'yesterday', hoursPlayed: '3', platform: '', extra: 1 }),
  );
  assert.equal(r.success, false);
  const paths = r.error.issues.map((i) => i.path.join('.')).sort();
  assert.deepEqual(paths, ['', 'hoursPlayed', 'lastPlayed', 'platform']);
});

test('allows null date and hours (platforms that report ownership only)', () => {
  const g = rawGameSchema.parse(row({ lastPlayed: null, hoursPlayed: null, url: null }));
  assert.equal(g.lastPlayed, null);
  assert.equal(g.hoursPlayed, null);
});

test('id may be an integer or a non-empty string', () => {
  assert.equal(rawGameSchema.parse(row({ id: 1184370 })).id, 1184370);
  assert.equal(rawGameSchema.safeParse(row({ id: 1.5 })).success, false);
  assert.equal(rawGameSchema.safeParse(row({ id: '' })).success, false);
});

test('parseOrThrow names the source and the failing row', () => {
  assert.throws(
    () => parseOrThrow(rawGamesSchema, [row(), row({ game: '' })], 'fixture.json'),
    /Validation failed for fixture.json:[\s\S]*\[1\]\.game/,
  );
});

test('data validation checks files and references, exits on errors, and never rewrites inputs', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-validation-'));
  t.after(() => fs.remove(dir));
  const annotation = { game: 'A', rating: 8, status: 'Complete', tags: ['Puzzle'] };
  const dashboard = {
    generatedAt: '2026-09-27T12:00:00.000Z',
    games: [buildGame(annotation, [row({ url: null })]).game],
  };
  const files = {
    'tags.json': { Puzzle: 'Puzzles' },
    'annotations.json': [annotation],
    'games.json': dashboard,
    'raw/batch.json': [row()],
    'raw/extra.json': [row()],
  };
  const command = path.resolve('scripts/validate-data.js');
  const run = () => spawnSync(process.execPath, [command], { cwd: dir, encoding: 'utf8' });
  for (const [file, value] of Object.entries(files)) await fs.outputJson(path.join(dir, 'data', file), value);
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /2 raw data files/);

  for (const [file, value, message] of [
    ['tags.json', { Puzzle: 1 }, /tags.json/],
    ['raw/extra.json', [row({ hoursPlayed: 'invalid' })], /extra.json/],
    ['games.json', { ...dashboard, generatedAt: 'invalid' }, /games.json/],
    ['annotations.json', [annotation, { ...annotation, game: 'B', aliases: ['A'] }], /alias/],
    ['annotations.json', [{ ...annotation, possible_aliases: ['Missing'] }], /possible_aliases/],
    ['annotations.json', [{ ...annotation, tags: ['Missing'] }], /tag vocabulary/],
    ['games.json', { ...dashboard, games: [{ ...dashboard.games[0], tags: ['Missing'] }] }, /tag vocabulary/],
  ]) {
    const target = path.join(dir, 'data', file);
    await fs.writeJson(target, value);
    const failed = run();
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(failed.stderr, message);
    assert.deepEqual(await fs.readJson(target), value);
    await fs.writeJson(target, files[file]);
  }
  const rawFile = path.join(dir, 'data/raw/batch.json');
  await fs.writeFile(rawFile, '{bad JSON');
  assert.equal(run().status, 1);
  assert.equal(await fs.readFile(rawFile, 'utf8'), '{bad JSON');
  await fs.writeJson(rawFile, files['raw/batch.json']);
  for (const [file, value] of Object.entries(files)) {
    assert.deepEqual(await fs.readJson(path.join(dir, 'data', file)), value);
  }
});
