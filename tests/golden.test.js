/**
 * Golden regression test for `process`.
 *
 * Runs the new pipeline over the committed raw files (concatenated, as the
 * batch command would produce) and the committed annotations, translated
 * in memory into the new format, and compares with the committed output of
 * the previous pipeline. Only the changes the rewrite set out to make may
 * differ:
 *
 *   1. Alias merging: rows whose name is an alias are folded into the
 *      canonical entry (fewer rows) or renamed to the canonical name.
 *   2. Overrides: per-platform hours are made consistent with an overridden
 *      total instead of being left as scraped.
 *   3. Cleanups: empty URLs become null and numeric strings become numbers.
 *
 * Everything else must match exactly.
 */

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { buildAliasMap } from '../src/process/annotations.js';
import { processGames } from '../src/process/index.js';
import { annotationsSchema, parseOrThrow, rawGamesSchema } from '../src/shared/model.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(REPO, 'data');
const GOLDEN = path.join(DATA, 'games-processed', 'annotated-games.json');
const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

const RAW_FILES = [
  'steam-games.json',
  'psn-games-uk.json',
  'psn-games-us.json',
  'xbox-games.json',
  'gog-games-raw.json',
];

/**
 * Translate the legacy annotation files into the new format. This is what
 * the migration script will do; it lives here until then.
 */
function translateAnnotations(legacy, gogAnnotations, platformsByGame) {
  const gogByGame = new Map(gogAnnotations.map((g) => [g.game, g]));
  return legacy.map((a) => {
    const { hoursPlayedTotal, lastPlayedTotal, ...rest } = a;
    const playtime = {};
    // GOG playtime came from a separate file, keyed by the platform's own spelling.
    for (const name of [a.game, ...(a.aliases ?? [])]) {
      const g = gogByGame.get(name);
      if (g) playtime.GOG = { hoursPlayed: Number(g.hoursPlayed), lastPlayed: g.lastPlayed };
    }
    // Total overrides applied to the whole game; assign them to its most-played platform.
    const platforms = platformsByGame.get(a.game) ?? [];
    if (hoursPlayedTotal !== undefined && platforms.length) {
      playtime[platforms[0]] = { ...playtime[platforms[0]], hoursPlayed: hoursPlayedTotal };
      for (const p of platforms.slice(1)) playtime[p] = { ...playtime[p], hoursPlayed: 0 };
    }
    if (lastPlayedTotal !== undefined && platforms.length) {
      playtime[platforms[0]] = { ...playtime[platforms[0]], lastPlayed: lastPlayedTotal };
    }
    return Object.keys(playtime).length ? { ...rest, playtime } : rest;
  });
}

test('process reproduces the golden output except for intended changes', {
  skip: !(await exists(GOLDEN)) && 'no committed data',
}, async () => {
  const rows = [];
  for (const f of RAW_FILES) rows.push(...(await fs.readJson(path.join(DATA, 'games-raw', f))));
  const legacy = await fs.readJson(path.join(DATA, 'manual', 'annotations.json'));
  const gogAnnotations = await fs.readJson(path.join(DATA, 'manual', 'gog-annotations.json'));
  const golden = await fs.readJson(GOLDEN);

  // Platforms per canonical game, most played first, from the golden output.
  const aliasTo = buildAliasMap(
    parseOrThrow(
      annotationsSchema,
      legacy.map(({ hoursPlayedTotal, lastPlayedTotal, ...a }) => a),
      'legacy',
    ),
  );
  const platformsByGame = new Map();
  for (const g of golden) {
    const canon = aliasTo.get(g.game) ?? g.game;
    const seen = platformsByGame.get(canon) ?? [];
    for (const p of g.platforms) if (!seen.includes(p)) seen.push(p);
    platformsByGame.set(canon, seen);
  }

  const annotations = parseOrThrow(
    annotationsSchema,
    translateAnnotations(legacy, gogAnnotations, platformsByGame),
    'translated',
  );
  const result = processGames(parseOrThrow(rawGamesSchema, rows, 'raw'), annotations);
  const fresh = new Map(result.games.map((g) => [g.game, g]));

  // Group golden rows by the canonical name they should end up under.
  const groups = new Map();
  for (const g of golden) {
    const canon = aliasTo.get(g.game) ?? g.game;
    if (!groups.has(canon)) groups.set(canon, []);
    groups.get(canon).push(g);
  }
  assert.deepEqual(
    [...fresh.keys()].sort(),
    [...groups.keys()].sort(),
    'game set differs beyond alias folding',
  );

  const num = (v) => Math.round(Number(v) * 10) / 10;
  const report = { unchanged: 0, renamed: 0, collapsed: 0, overrideFixed: 0 };
  for (const [canon, oldRows] of groups) {
    const g = fresh.get(canon);
    const legacyEntry = legacy.find((a) => a.game === canon);
    const hasOverride =
      legacyEntry.hoursPlayedTotal !== undefined || legacyEntry.lastPlayedTotal !== undefined;

    assert.equal(
      g.hoursPlayedTotal,
      num(g.hoursPlayedSingle.reduce((s, h) => s + h, 0)),
      `${canon}: total != sum`,
    );
    assert.equal(g.lastPlayedTotal, g.lastPlayedSingle.filter(Boolean).sort().at(-1), `${canon}: total date`);
    assert.equal(g.rating, oldRows[0].rating, `${canon}: rating`);
    assert.equal(g.status, oldRows[0].status, `${canon}: status`);

    if (oldRows.length > 1 || hasOverride) {
      if (oldRows.length > 1) report.collapsed += 1;
      if (hasOverride) report.overrideFixed += 1;
      const platforms = [...new Set(oldRows.flatMap((r) => r.platforms))].sort();
      assert.deepEqual([...g.platforms].sort(), platforms, `${canon}: platforms`);
      if (!hasOverride) {
        assert.equal(
          g.hoursPlayedTotal,
          num(oldRows.reduce((s, r) => s + num(r.hoursPlayedTotal), 0)),
          `${canon}: hours after collapse`,
        );
      } else {
        assert.equal(g.hoursPlayedTotal, num(oldRows[0].hoursPlayedTotal), `${canon}: overridden total`);
      }
      continue;
    }

    const old = oldRows[0];
    if (old.game !== canon) report.renamed += 1;
    else report.unchanged += 1;
    const normalised = {
      ...old,
      game: canon,
      urls: old.urls.map((u) => (u === '' ? null : u)),
      displayUrl: old.displayUrl === '' ? null : old.displayUrl,
      hoursPlayedSingle: old.hoursPlayedSingle.map(num),
      hoursPlayedTotal: num(old.hoursPlayedTotal),
    };
    assert.deepEqual(g, normalised, `${canon}: row differs`);
  }
  console.log(`golden: ${golden.length} old rows -> ${fresh.size} new rows;`, report);
});
