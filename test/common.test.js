import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import { combineDuplicateIds, finalizeRawGames, isoToDate, roundHours } from '../src/scrape/common.js';

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
        [{ game: 'G', platform: 'Wii', lastPlayed: null, hoursPlayed: 1, id: 1, url: null }],
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
