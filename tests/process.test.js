import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annotationSchema } from '../src/lib/model.js';
import { buildAliasMap, checkTags } from '../src/process/annotations.js';
import {
  blankAnnotations,
  buildGame,
  combinePlatformRows,
  PlaytimeRuleError,
  processGames,
} from '../src/process/index.js';

const row = (game, platform, hours, date, extra = {}) => ({
  game,
  platform,
  hoursPlayed: hours,
  lastPlayed: date,
  id: extra.id ?? `${platform}-${game}`,
  url: extra.url === undefined ? `https://${platform}/${game}` : extra.url,
});
const ann = (game, extra = {}) => ({ game, rating: 7, status: 'Complete', tags: ['RPG'], ...extra });

test('annotation schema accepts the documented shape and rejects unknown fields', () => {
  assert.equal(
    annotationSchema.safeParse(
      ann('G', { aliases: ['g'], playtime: { GOG: { hoursPlayed: 3, lastPlayed: '2019-01-01' } } }),
    ).success,
    true,
  );
  assert.equal(annotationSchema.safeParse(ann('G', { hoursPlayedTotal: 5 })).success, false);
  assert.equal(annotationSchema.safeParse(ann('G', { status: 'Playing' })).success, false);
  assert.equal(annotationSchema.safeParse(ann('G', { playtime: { GOG: { hours: 3 } } })).success, false);
  assert.equal(annotationSchema.safeParse(ann('G', { rating: null, status: null })).success, true);
});

test('a rated game must have a status', () => {
  const r = annotationSchema.safeParse(ann('G', { rating: 7, status: null }));
  assert.equal(r.success, false);
  assert.deepEqual(
    r.error.issues.map((i) => [i.path.join('.'), i.message]),
    [['status', 'a rated game must have a status']],
  );
  assert.equal(annotationSchema.safeParse(ann('G', { rating: null, status: 'In Progress' })).success, true);
});

test('checkTags accepts vocabulary tags and lists every unknown one by game', () => {
  const tags = { RPG: 'role-playing', Puzzle: 'puzzles' };
  assert.doesNotThrow(() => checkTags([ann('A'), ann('B', { tags: ['Puzzle', 'RPG'] })], tags));
  assert.throws(
    () =>
      checkTags([ann('A', { tags: ['Rpg'] }), ann('B', { tags: ['Puzzle', 'Mistery'] })], tags, 'file.json'),
    /2 tag\(s\) in file.json[\s\S]*"A": Rpg[\s\S]*"B": Mistery/,
  );
});

test('buildAliasMap rejects duplicate names and ambiguous aliases', () => {
  assert.deepEqual(
    [...buildAliasMap([ann('A', { aliases: ['a1', 'a2'] }), ann('B')])],
    [
      ['a1', 'A'],
      ['a2', 'A'],
    ],
  );
  assert.throws(() => buildAliasMap([ann('A'), ann('A')]), /Duplicate names/);
  assert.throws(() => buildAliasMap([ann('A', { aliases: ['B'] }), ann('B')]), /also an entry's name/);
  assert.throws(
    () => buildAliasMap([ann('A', { aliases: ['x'] }), ann('B', { aliases: ['x'] })]),
    /belongs to both/,
  );
});

test('combinePlatformRows sums hours, keeps the latest date and its id/url, and treats null hours as unknown', () => {
  const e = combinePlatformRows('PS5', [
    row('G', 'PS5', 1.2, '2020-01-01', { id: 'old', url: 'u-old' }),
    row('G', 'PS5', 2.3, '2022-01-01', { id: 'new', url: 'u-new' }),
  ]);
  assert.deepEqual(e, {
    platform: 'PS5',
    hoursPlayed: 3.5,
    lastPlayed: '2022-01-01',
    id: 'new',
    url: 'u-new',
  });
  assert.equal(combinePlatformRows('GOG', [row('G', 'GOG', null, null)]).hoursPlayed, null);
  assert.equal(
    combinePlatformRows('GOG', [row('G', 'GOG', null, null), row('G', 'GOG', 2, null, { id: 'b' })])
      .hoursPlayed,
    2,
  );
});

test('buildGame orders platforms by hours, derives totals and picks the display url by preference', () => {
  const { game, violations } = buildGame(ann('G'), [
    row('G', 'Xbox', 5, '2021-01-01', { url: null }),
    row('G', 'Steam', 1, '2020-01-01'),
    row('G', 'PS5', 10, '2019-01-01'),
  ]);
  assert.deepEqual(violations, []);
  assert.deepEqual(game.platforms, ['PS5', 'Xbox', 'Steam']);
  assert.deepEqual(game.hoursPlayedSingle, [10, 5, 1]);
  assert.equal(game.hoursPlayedTotal, 16);
  assert.equal(game.lastPlayedTotal, '2021-01-01');
  assert.equal(game.displayUrl, 'https://Steam/G');
});

test('playtime corrections replace only the fields given, and stale ones are reported', () => {
  const { game, ignoredCorrections } = buildGame(
    ann('G', {
      playtime: {
        GOG: { hoursPlayed: 3, lastPlayed: '2019-01-01' },
        Xbox: { hoursPlayed: 0.5 },
        PS5: { hoursPlayed: 1 },
      },
    }),
    [row('G', 'GOG', null, null), row('G', 'Xbox', 104.6, '2026-05-10')],
  );
  assert.deepEqual(game.platforms, ['GOG', 'Xbox']);
  assert.deepEqual(game.hoursPlayedSingle, [3, 0.5]);
  assert.deepEqual(game.lastPlayedSingle, ['2019-01-01', '2026-05-10']);
  assert.equal(ignoredCorrections.length, 1);
  assert.match(ignoredCorrections[0], /PS5, but it was not scraped there/);
});

test('playtime rules: null hours, undated playtime, and no playtime anywhere are violations', () => {
  assert.match(
    buildGame(ann('G'), [row('G', 'GOG', null, null)]).violations[0],
    /no playtime on GOG; set playtime.GOG.hoursPlayed/,
  );
  assert.match(
    buildGame(ann('G'), [row('G', 'Steam', 2, null)]).violations[0],
    /playtime on Steam but no date/,
  );
  assert.match(buildGame(ann('G'), [row('G', 'Xbox', 0, null)]).violations[0], /no playtime on any platform/);
  const ok = buildGame(ann('G', { playtime: { GOG: { hoursPlayed: 0 } } }), [
    row('G', 'GOG', null, null),
    row('G', 'Steam', 2, '2020-01-01'),
  ]);
  assert.deepEqual(ok.violations, []);
  assert.deepEqual(ok.game.hoursPlayedSingle, [2, 0]);
  assert.deepEqual(ok.game.lastPlayedSingle, ['2020-01-01', null]);
});

test('processGames joins by name and alias, selects rated games, and reports the rest', () => {
  const rows = [
    row('Slay the Spire', 'Steam', 223.4, '2024-01-01'),
    row('Slay The Spire', 'Xbox', 37.7, '2025-01-01', { url: null }),
    row('Unrated', 'Steam', 1, '2020-01-01'),
    row('Orphan', 'Steam', 1, '2020-01-01'),
    row('Owned Unplayed', 'GOG', null, null),
  ];
  const annotations = [
    ann('Slay the Spire', { aliases: ['Slay The Spire'] }),
    ann('Unrated', { rating: null, status: null }),
    ann('Ghost'),
  ];
  const r = processGames(rows, annotations);
  assert.deepEqual(
    r.games.map((g) => g.game),
    ['Slay the Spire'],
  );
  assert.deepEqual(r.games[0].platforms, ['Steam', 'Xbox']);
  assert.equal(r.games[0].hoursPlayedTotal, 261.1);
  assert.equal(r.games[0].lastPlayedTotal, '2025-01-01');
  assert.deepEqual(r.unannotated, ['Orphan']);
  assert.deepEqual(r.unmatched, ['Ghost']);
  assert.deepEqual(r.unrated, ['Unrated']);
});

test('processGames stops with every violation listed and writes nothing', () => {
  assert.throws(
    () => processGames([row('A', 'GOG', null, null), row('B', 'Steam', 3, null)], [ann('A'), ann('B')]),
    (err) =>
      err instanceof PlaytimeRuleError &&
      /2 game\(s\)/.test(err.message) &&
      /"A" has no playtime on GOG/.test(err.message) &&
      /"B" has playtime on Steam but no date/.test(err.message),
  );
});

test('blankAnnotations produces fill-in entries', () => {
  assert.deepEqual(blankAnnotations(['X']), [{ game: 'X', rating: null, status: null, tags: [] }]);
});
