import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { silentLogger } from '../src/lib/log.js';
import { annotationSchema } from '../src/lib/model.js';
import {
  aliasNameKey,
  buildAliasMap,
  checkTags,
  nameSimilarity,
  suggestAliases,
} from '../src/process/annotations.js';
import {
  blankAnnotations,
  buildGame,
  combinePlatformRows,
  PlaytimeRuleError,
  processGames,
  runProcess,
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
  assert.equal(annotationSchema.safeParse(ann('G', { status: 'Ongoing' })).success, false);
  assert.equal(annotationSchema.safeParse(ann('G', { status: 'In Progress' })).success, false);
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
  assert.equal(annotationSchema.safeParse(ann('G', { rating: null, status: 'Active' })).success, true);
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

const unplayed = (extra = {}) => ann('Game', { status: 'Unplayed', rating: null, tags: [], ...extra });

test('Unplayed rejects nonzero corrected playtime on every platform, even when unrated', () => {
  assert.throws(
    () =>
      processGames(
        [row('Game', 'Steam', 4, '2026-09-01'), row('Alias', 'PS5', 2, '2026-09-01')],
        [unplayed({ aliases: ['Alias'] })],
      ),
    /Unplayed.*Steam[\s\S]*Unplayed.*PS5/,
  );
  assert.throws(
    () =>
      processGames(
        [row('Game', 'Steam', 0, '2026-09-01')],
        [unplayed({ playtime: { Steam: { hoursPlayed: 2 } } })],
      ),
    /Unplayed.*Steam/,
  );
});

test('Unplayed accepts zero or unknown hours, applies explicit corrections and excludes even rated entries', () => {
  for (const rating of [null, 7]) {
    const result = processGames(
      [row('Game', 'Steam', 20, '2026-09-01'), row('Game', 'GOG', null, '2026-09-01')],
      [unplayed({ rating, playtime: { Steam: { hoursPlayed: 0 } } })],
    );
    assert.deepEqual(result.games, []);
    assert.deepEqual(result.unrated, []);
  }
  assert.deepEqual(processGames([row('Game', 'Steam', 0, '2026-09-01')], [unplayed()]).games, []);
});

test('invalid Unplayed data leaves annotations and output files untouched', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-unplayed-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    log: silentLogger,
  };
  await fs.writeJson(options.input, [
    row('Game', 'Steam', 3, '2026-09-01'),
    row('New', 'Steam', 1, '2026-09-01'),
  ]);
  await fs.writeJson(options.annotationsFile, [unplayed()]);
  await fs.writeJson(options.tagsFile, {});
  await fs.writeJson(options.out, ['existing output']);
  await assert.rejects(runProcess(options), /Unplayed.*Steam/);
  assert.deepEqual(await fs.readJson(options.annotationsFile), [unplayed()]);
  assert.deepEqual(await fs.readJson(options.out), ['existing output']);
});

test('process adds and alphabetises annotations, preserving existing fields and avoiding duplicates', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-annotations-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    log: silentLogger,
  };
  const z = ann('Z', { aliases: ['Alias'], playtime: { Steam: { hoursPlayed: 3 } } });
  const b = ann('b', { rating: null, status: null });
  await fs.writeJson(options.annotationsFile, [z, b]);
  await fs.writeJson(options.tagsFile, { RPG: 'Role-playing' });
  const known = row('Alias', 'Steam', 2, '2026-01-01');
  await fs.writeJson(options.input, [known]);
  await runProcess(options);
  assert.deepEqual(await fs.readJson(options.annotationsFile), [b, z]);

  await fs.writeJson(options.input, [
    known,
    row('A', 'Steam', 1, '2026-01-01'),
    row('A', 'PS5', 2, '2026-01-02'),
    row('Unplayed', 'GOG', null, null),
  ]);
  await runProcess(options);
  const expected = [...blankAnnotations(['A']), b, z];
  assert.deepEqual(await fs.readJson(options.annotationsFile), expected);
  const { games, generatedAt } = await fs.readJson(options.out);
  assert.equal(new Date(generatedAt).toISOString(), generatedAt);
  assert.deepEqual(
    games.map((g) => g.game),
    ['Z'],
  );
  assert.equal(games[0].hoursPlayedTotal, 3);
  assert.equal(await fs.pathExists(path.join(dir, 'unannotated.json')), false);

  await runProcess(options);
  assert.deepEqual(await fs.readJson(options.annotationsFile), expected);
  const savedOutput = await fs.readJson(options.out);
  await fs.writeJson(options.input, [row('Z', 'GOG', null, null), row('New', 'Steam', 1, '2026-01-01')]);
  await assert.rejects(runProcess(options), /no playtime on GOG/);
  assert.deepEqual(await fs.readJson(options.annotationsFile), expected);
  assert.deepEqual(await fs.readJson(options.out), savedOutput);
});

test('alias similarity uses normalized prefix and edit distance, retaining all plausible candidates', () => {
  assert.equal(aliasNameKey('  GAME™:  Name® © '), 'game name');
  assert.equal(nameSimilarity('Game: Name™', 'GAME NAME'), 1);
  assert.equal(nameSimilarity('', 'Game'), 0);
  assert.equal(nameSimilarity('abc', 'abd'), 2 / 3);
  assert.equal(nameSimilarity('abc', 'abcdef'), 0.75);
  assert.deepEqual(
    suggestAliases('Example Game III', [
      ann('Example Game'),
      ann('Unrelated'),
      ann('Example Game II'),
      ann('Older title', { aliases: ['Example Game III'], possible_aliases: ['Example Game'] }),
    ]),
    ['Older title', 'Example Game II', 'Example Game'],
  );
});

test('possible alias lists allow pending targets and cycles but reject missing and self targets', () => {
  assert.doesNotThrow(() =>
    buildAliasMap([ann('A', { possible_aliases: ['B'] }), ann('B', { possible_aliases: ['A'] })]),
  );
  for (const target of ['A', 'Missing']) {
    assert.throws(
      () => buildAliasMap([ann('A', { possible_aliases: [target] })]),
      /invalid possible_aliases/,
    );
  }
  assert.equal(annotationSchema.safeParse(ann('A', { possible_aliases: [] })).success, false);
});

test('process suggests aliases only across both missing lists and preserves decisions on rerun', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-aliases-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    log: silentLogger,
  };
  await fs.writeJson(options.tagsFile, { RPG: 'Role-playing' });
  await fs.writeJson(options.annotationsFile, [
    ann('Example Game'),
    ann('Example Game II'),
    ann('Example Game Deluxe', { aliases: ['Current Name'] }),
    ann('Example Game IV', {
      rating: null,
      status: null,
      tags: [],
      possible_aliases: ['Example Game'],
    }),
  ]);
  await fs.writeJson(options.input, [
    row('Example Game III', 'Steam', 2, '2026-01-01'),
    row('Current Name', 'GOG', 2, '2026-01-01'),
    row('Unknown', 'Steam', 2, '2026-01-01'),
    row('Example Game Owned', 'GOG', null, null),
  ]);
  await runProcess(options);
  const entries = await fs.readJson(options.annotationsFile);
  const added = entries.find((a) => a.game === 'Example Game III');
  assert.deepEqual(added.possible_aliases, ['Example Game II', 'Example Game IV', 'Example Game']);
  assert.equal(entries.find((a) => a.game === 'Unknown').possible_aliases, undefined);
  assert.equal(
    entries.some((a) => a.game === 'Example Game Owned'),
    false,
  );
  await runProcess(options);
  assert.deepEqual(await fs.readJson(options.annotationsFile), entries);
  delete added.possible_aliases;
  await fs.writeJson(options.annotationsFile, entries);
  await runProcess(options);
  assert.deepEqual(await fs.readJson(options.annotationsFile), entries);
});

test('edition suffixes on short real titles remain alias candidates', () => {
  const candidates = [ann('Deus Ex'), ann('Weird West'), ann('Lone Survivor')];
  assert.deepEqual(suggestAliases('Myst: Masterpiece Edition', [ann('Myst')]), ['Myst']);
  assert.deepEqual(suggestAliases('Deus Ex: Game of the Year Edition', candidates), ['Deus Ex']);
  assert.deepEqual(suggestAliases('Weird West: Definitive Edition', candidates), ['Weird West']);
  assert.deepEqual(suggestAliases("Lone Survivor: The Director's Cut", candidates), ['Lone Survivor']);
});

test('rated games need tags for output; unrated and Unplayed games are not counted as untagged', () => {
  const rows = [
    row('Alias', 'Steam', 2, null),
    row('Unknown hours', 'GOG', null, null),
    row('Unrated', 'Steam', 1, null),
    row('Unplayed', 'Steam', 0, null),
    row('Ready', 'Steam', 1, '2026-01-01'),
  ];
  const result = processGames(rows, [
    ann('Missing tags', { tags: [], aliases: ['Alias'] }),
    ann('Unknown hours', { tags: [] }),
    ann('Unrated', { rating: null, tags: [] }),
    ann('Unplayed', { status: 'Unplayed', tags: [] }),
    ann('Ready'),
  ]);
  assert.deepEqual(
    result.games.map((g) => g.game),
    ['Ready'],
  );
  assert.deepEqual(result.untagged, ['Missing tags', 'Unknown hours']);
  assert.deepEqual(result.unrated, ['Unrated']);
  assert.throws(
    () =>
      processGames([row('Unplayed', 'Steam', 1, null)], [ann('Unplayed', { status: 'Unplayed', tags: [] })]),
    /Unplayed but has playtime/,
  );
});
