import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { silentLogger } from '../src/lib/log.js';
import {
  combineDuplicateIds,
  finalizeRawGames,
  isoToDate,
  retainMissingGames,
  roundHours,
  writeRawGames,
} from '../src/scrape/common.js';

test('isoToDate returns the UTC calendar date or null', () => {
  assert.equal(isoToDate('2024-08-03T19:28:27.12Z'), '2024-08-03');
  assert.equal(isoToDate('2024-08-03T23:30:00-05:00'), '2024-08-04');
  assert.equal(isoToDate(null), null);
  assert.equal(isoToDate(''), null);
  assert.throws(() => isoToDate('not a date'), /Unparseable timestamp/);
});

test('roundHours rounds to one decimal', () => {
  assert.equal(roundHours(0.1 + 0.2), 0.3);
  assert.equal(roundHours(12.25), 12.3);
});

test('combineDuplicateIds treats null hours as zero and null dates as unknown', () => {
  const rows = [
    { game: 'G', platform: 'GOG', lastPlayed: null, hoursPlayed: null, id: 1, url: null },
    { game: 'G', platform: 'GOG', lastPlayed: '2020-02-02', hoursPlayed: 1.5, id: 1, url: null },
  ];
  const [g] = combineDuplicateIds(rows, silentLogger);
  assert.equal(g.hoursPlayed, 1.5);
  assert.equal(g.lastPlayed, '2020-02-02');
});

test('finalizeRawGames rejects rows that do not match the schema', () => {
  assert.throws(
    () =>
      finalizeRawGames(
        [{ game: 'G', platform: '', lastPlayed: null, hoursPlayed: 1, id: 1, url: null }],
        'test',
      ),
    /Validation failed for test[\s\S]*platform/,
  );
  assert.throws(() => finalizeRawGames([{ game: 'G' }], 'test'), /platform[\s\S]*hoursPlayed/);
});

test('finalizeRawGames normalises empty urls to null and sorts by hours', () => {
  const games = finalizeRawGames(
    [
      { game: 'Short', platform: 'Xbox', lastPlayed: '2020-01-01', hoursPlayed: 1, id: '1', url: '' },
      { game: 'Long', platform: 'Xbox', lastPlayed: '2020-01-01', hoursPlayed: 9, id: '2', url: null },
    ],
    'test',
  );
  assert.deepEqual(
    games.map((g) => [g.game, g.url]),
    [
      ['Long', null],
      ['Short', null],
    ],
  );
});

test('scrape history retains missing games per account and prefers fresh names and playtimes', () => {
  const row = (source, id, hoursPlayed = 2, game = 'Old name') => ({
    source,
    id,
    hoursPlayed,
    game,
    platform: 'PS5',
    lastPlayed: '2020-12-04',
    url: null,
  });
  const previous = [row('psn', 1), row('psn:uk', 1), row('psn', 2), row('psn:removed', 3)];
  const fresh = [row('psn', '1', 1, 'New name'), row('psn:uk', 4, 3, 'New game')];
  const warnings = [];
  const result = retainMissingGames(
    previous,
    fresh,
    { psn: 'PS5', 'psn:uk': 'PS5' },
    {
      warn: (message) => warnings.push(message),
    },
  );
  assert.deepEqual(result, [...fresh, previous[1], previous[2]]);
  assert.match(warnings[0], /Retained 2[\s\S]*psn:uk, id 1[\s\S]*psn, id 2/);
  assert.equal(previous[0].hoursPlayed, 2);
  assert.deepEqual(retainMissingGames(result, fresh, { psn: 'PS5', 'psn:uk': 'PS5' }, silentLogger), result);
});

test('empty successful scrapes retain history and update display labels', () => {
  const old = {
    source: 'steam:alt',
    id: 1,
    game: 'Demo',
    platform: 'Old label',
    hoursPlayed: 2,
    lastPlayed: null,
    url: null,
  };
  assert.deepEqual(retainMissingGames([old], [], { 'steam:alt': 'Steam' }, silentLogger), [
    { ...old, platform: 'Steam' },
  ]);
});

test('legacy history is retained when its source is unambiguous; missing ambiguous rows require attribution', () => {
  const old = { id: 1, game: 'Demo', platform: 'Steam', hoursPlayed: 2, lastPlayed: null, url: null };
  assert.deepEqual(retainMissingGames([old], [], { steam: 'Steam' }, silentLogger), [
    { ...old, source: 'steam' },
  ]);
  const sources = { steam: 'Steam', 'steam:alt': 'Steam' };
  assert.throws(() => retainMissingGames([old], [], sources, silentLogger), /no source.*multiple accounts/);
  const fresh = [{ ...old, source: 'steam' }];
  assert.deepEqual(retainMissingGames([old], fresh, sources, silentLogger), fresh);
  assert.throws(() => retainMissingGames([old, old], fresh, sources, silentLogger), /no source/);
  assert.throws(() => retainMissingGames([...fresh, old], fresh, sources, silentLogger), /no source/);
});

test('writeRawGames preserves history, supports new files, and refuses malformed history without overwriting it', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-history-'));
  t.after(() => fs.remove(dir));
  const file = path.join(dir, 'steam.json');
  const game = {
    source: 'steam',
    id: 247750,
    game: 'Demo',
    platform: 'Steam',
    hoursPlayed: 2,
    lastPlayed: '2020-12-04',
    url: null,
  };
  await writeRawGames(file, [game], silentLogger, { steam: 'Steam' });
  await writeRawGames(file, [], silentLogger, { steam: 'Steam' });
  assert.deepEqual(await fs.readJson(file), [game]);
  await fs.writeFile(file, 'broken');
  await assert.rejects(writeRawGames(file, [], silentLogger, { steam: 'Steam' }));
  assert.equal(await fs.readFile(file, 'utf8'), 'broken');
});
