import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotate, applyOverrides, buildAliasMap, chooseDisplayUrl } from '../src/process/annotate.js';
import { mergePlatforms } from '../src/process/mergePlatforms.js';
import { silentLogger } from '../src/lib/log.js';

const raw = (game, platform, hours, date, extra = {}) => ({
  game, platform, hoursPlayed: hours, lastPlayed: date, id: `${platform}-${game}`, url: `https://${platform}/${game}`, ...extra,
});
const ann = (game, extra = {}) => ({ game, rating: 7, status: 'Complete', tags: ['RPG'], ...extra });

test('aliases fold differently spelled rows into one canonical row', () => {
  const merged = mergePlatforms([raw('Slay the Spire', 'Steam', 223.4, '2024-01-01'), raw('Slay The Spire', 'Xbox', 37.7, '2025-01-01')]);
  const { games } = annotate(merged, [ann('Slay the Spire', { aliases: ['Slay The Spire'] })], silentLogger);
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.game, 'Slay the Spire');
  assert.deepEqual(g.platforms, ['Steam', 'Xbox']);
  assert.equal(g.hoursPlayedTotal, 261.1);
  assert.equal(g.lastPlayedTotal, '2025-01-01');
  assert.equal(g.aliases, undefined);
});

test('an alias-only row is renamed to the canonical name', () => {
  const merged = mergePlatforms([raw('Pathfinder: WotR - Enhanced Edition', 'Steam', 500, '2024-01-01')]);
  const { games } = annotate(merged, [ann('Pathfinder: WotR', { aliases: ['Pathfinder: WotR - Enhanced Edition'] })], silentLogger);
  assert.equal(games[0].game, 'Pathfinder: WotR');
});

test('aliases on the same platform merge hours and keep the most recent id', () => {
  const merged = mergePlatforms([
    raw('Divinity 2', 'Steam', 100, '2018-01-01', { id: 'a' }),
    raw('Divinity 2 - Definitive Edition', 'Steam', 50, '2020-01-01', { id: 'b' }),
  ]);
  const { games } = annotate(merged, [ann('Divinity 2', { aliases: ['Divinity 2 - Definitive Edition'] })], silentLogger);
  assert.deepEqual(games[0].platforms, ['Steam']);
  assert.deepEqual(games[0].hoursPlayedSingle, [150]);
  assert.deepEqual(games[0].ids, ['b']);
});

test('ambiguous alias configurations are rejected', () => {
  assert.throws(() => buildAliasMap([ann('A', { aliases: ['B'] }), ann('B')]), /also a canonical/);
  assert.throws(() => buildAliasMap([ann('A', { aliases: ['X'] }), ann('B', { aliases: ['X'] })]), /claimed by both/);
});

test('inner join: unrated and unannotated games are excluded and reported', () => {
  const merged = mergePlatforms([raw('Rated', 'Steam', 1, '2020-01-01'), raw('Unrated', 'Steam', 1, '2020-01-01'), raw('Orphan', 'Steam', 1, '2020-01-01')]);
  const result = annotate(merged, [ann('Rated'), ann('Unrated', { rating: null }), ann('Ghost')], silentLogger);
  assert.deepEqual(result.games.map((g) => g.game), ['Rated']);
  assert.deepEqual(result.unrated, ['Unrated']);
  assert.deepEqual(result.unannotated, ['Orphan']);
  assert.deepEqual(result.unmatched, ['Ghost']);
});

test('hours override scales per-platform hours proportionally and exactly', () => {
  const row = mergePlatforms([raw('G', 'Steam', 223.4, '2024-01-01'), raw('G', 'Xbox', 37.7, '2025-01-01')]).get('G');
  applyOverrides(row, ann('G', { hoursPlayedOverride: 100 }));
  assert.equal(row.hoursPlayedTotal, 100);
  assert.equal(Math.round(row.hoursPlayedSingle.reduce((a, b) => a + b) * 10) / 10, 100);
  assert.ok(row.hoursPlayedSingle[0] > row.hoursPlayedSingle[1]);
});

test('hours override on a single platform sets that platform directly, even from zero', () => {
  const row = mergePlatforms([raw('G', 'Xbox', 0, '2024-01-01')]).get('G');
  applyOverrides(row, ann('G', { hoursPlayedOverride: 4.5 }));
  assert.deepEqual(row.hoursPlayedSingle, [4.5]);
  assert.equal(row.hoursPlayedTotal, 4.5);
});

test('date override replaces total and, on a single platform, the platform date too', () => {
  const single = mergePlatforms([raw('G', 'Steam', 1, null)]).get('G');
  applyOverrides(single, ann('G', { lastPlayedOverride: '2010-10-01' }));
  assert.equal(single.lastPlayedTotal, '2010-10-01');
  assert.deepEqual(single.lastPlayedSingle, ['2010-10-01']);

  const multi = mergePlatforms([raw('G', 'Steam', 1, '2020-01-01'), raw('G', 'PS5', 1, '2021-01-01')]).get('G');
  applyOverrides(multi, ann('G', { lastPlayedOverride: '2022-02-02' }));
  assert.equal(multi.lastPlayedTotal, '2022-02-02');
  assert.deepEqual(multi.lastPlayedSingle, ['2020-01-01', '2021-01-01']);
});

test('display url prefers Steam, then PS5, then any non-null url', () => {
  const row = mergePlatforms([raw('G', 'Xbox', 5, '2020-01-01', { url: null }), raw('G', 'PS5', 1, '2020-01-01'), raw('G', 'Steam', 1, '2020-01-01')]).get('G');
  assert.equal(chooseDisplayUrl(row), 'https://Steam/G');
  const xboxOnly = mergePlatforms([raw('G', 'Xbox', 5, '2020-01-01', { url: null })]).get('G');
  assert.equal(chooseDisplayUrl(xboxOnly), null);
});

test('output is sorted by name and carries the annotation fields', () => {
  const merged = mergePlatforms([raw('Zed', 'Steam', 1, '2020-01-01'), raw('Alpha', 'Steam', 1, '2020-01-01')]);
  const { games } = annotate(merged, [ann('Zed', { status: 'Abandoned', tags: ['X'] }), ann('Alpha')], silentLogger);
  assert.deepEqual(games.map((g) => g.game), ['Alpha', 'Zed']);
  assert.equal(games[1].status, 'Abandoned');
  assert.deepEqual(games[1].tags, ['X']);
  assert.equal(games[1].displayUrl, 'https://Steam/Zed');
});
