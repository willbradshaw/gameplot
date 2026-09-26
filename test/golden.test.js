/**
 * Golden regression test.
 *
 * Runs the new `process` stage over the committed raw and manual data and
 * compares the result with the committed annotated-games.json produced by the
 * previous (Python) pipeline. The two are expected to differ only in the
 * ways the rewrite set out to change:
 *
 *   1. Alias merging: rows whose name is an alias are folded into the
 *      canonical row (fewer rows) or renamed to the canonical name.
 *   2. Overrides: per-platform hours/dates are made consistent with an
 *      overridden total instead of being left as scraped.
 *   3. Cleanups: empty URLs become null, numeric strings become numbers,
 *      and 1970 dates from Steam become null.
 *
 * Everything else must match exactly. The test prints a summary of the
 * intended differences so a reviewer can eyeball them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/lib/json.js';
import { silentLogger } from '../src/lib/log.js';
import { buildAliasMap } from '../src/process/annotate.js';
import { loadAnnotations } from '../src/process/loaders.js';
import { runProcess } from '../src/process/index.js';
import { MIN_VALID_DATE } from '../src/shared/model.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(REPO, 'data');
const GOLDEN = path.join(DATA, 'games-processed', 'annotated-games.json');

const exists = (p) => access(p).then(() => true, () => false);

/** Bring an old row onto the new conventions so the exact-match comparison is fair. */
function normaliseOld(row) {
  // Old totals carry float noise (39.300000000000004); the new pipeline rounds.
  const num = (v) => Math.round((typeof v === 'string' ? Number(v) : v) * 10) / 10;
  const date = (d) => (d !== null && d < MIN_VALID_DATE ? null : d);
  return {
    ...row,
    urls: row.urls.map((u) => (u === '' ? null : u)),
    displayUrl: row.displayUrl === '' ? null : row.displayUrl,
    hoursPlayedSingle: row.hoursPlayedSingle.map(num),
    hoursPlayedTotal: num(row.hoursPlayedTotal),
    lastPlayedSingle: row.lastPlayedSingle.map(date),
    lastPlayedTotal: date(row.lastPlayedTotal),
  };
}

const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10;

test('new pipeline reproduces the golden output except for intended changes', { skip: !(await exists(GOLDEN)) && 'no committed data' }, async () => {
  const golden = (await readJson(GOLDEN)).map(normaliseOld);
  const annotations = await loadAnnotations(path.join(DATA, 'manual', 'annotations.json'), silentLogger);
  const aliasTo = buildAliasMap(annotations);
  const annotationByName = new Map(annotations.map((a) => [a.game, a]));

  const result = await runProcess({ dataDir: DATA, write: false, log: silentLogger });
  const fresh = new Map(result.games.map((g) => [g.game, g]));

  // Group golden rows by the canonical name they should end up under.
  const groups = new Map();
  for (const row of golden) {
    const canon = aliasTo.get(row.game) ?? row.game;
    if (!groups.has(canon)) groups.set(canon, []);
    groups.get(canon).push(row);
  }

  // 1. Same set of games once aliases are accounted for.
  assert.deepEqual([...fresh.keys()].sort(), [...groups.keys()].sort(), 'game set differs beyond alias folding');

  const report = { unchanged: 0, renamed: 0, collapsed: 0, overrideFixed: 0, dateNulled: 0 };

  for (const [canon, oldRows] of groups) {
    const g = fresh.get(canon);
    const a = annotationByName.get(canon);
    const hasOverride = a.hoursPlayedOverride !== undefined || a.lastPlayedOverride !== undefined;

    // 2. Every new row is internally consistent.
    assert.equal(g.hoursPlayedTotal, sum(g.hoursPlayedSingle), `${canon}: total != sum of per-platform hours`);
    const latestSingle = g.lastPlayedSingle.filter(Boolean).sort().at(-1) ?? null;
    if (a.lastPlayedOverride === undefined) {
      assert.equal(g.lastPlayedTotal, latestSingle, `${canon}: lastPlayedTotal != latest per-platform date`);
    } else {
      assert.equal(g.lastPlayedTotal, a.lastPlayedOverride, `${canon}: override not applied`);
    }

    // 3. Annotation fields carried over unchanged.
    assert.equal(g.rating, oldRows[0].rating, `${canon}: rating`);
    assert.equal(g.status, oldRows[0].status, `${canon}: status`);

    if (oldRows.length > 1) {
      // Collapsed via alias: platforms are the union, hours are the sum (unless overridden).
      report.collapsed += 1;
      const platforms = [...new Set(oldRows.flatMap((r) => r.platforms))].sort();
      assert.deepEqual([...g.platforms].sort(), platforms, `${canon}: platforms after collapse`);
      if (!hasOverride) {
        assert.equal(g.hoursPlayedTotal, sum(oldRows.map((r) => r.hoursPlayedTotal)), `${canon}: hours after collapse`);
        assert.equal(g.lastPlayedTotal, oldRows.map((r) => r.lastPlayedTotal).filter(Boolean).sort().at(-1) ?? null, `${canon}: date after collapse`);
      } else {
        report.overrideFixed += 1;
      }
      continue;
    }

    const old = oldRows[0];
    if (old.game !== canon) report.renamed += 1;
    if (old.lastPlayedSingle.includes(null)) report.dateNulled += 1;

    if (hasOverride) {
      // Old output kept scraped per-platform values next to an overridden total; new output reconciles them.
      report.overrideFixed += 1;
      assert.equal(g.hoursPlayedTotal, old.hoursPlayedTotal, `${canon}: overridden total changed`);
      assert.equal(g.lastPlayedTotal, old.lastPlayedTotal, `${canon}: overridden date changed`);
      assert.deepEqual([...g.platforms].sort(), [...old.platforms].sort(), `${canon}: platforms`);
      continue;
    }

    // 4. Otherwise the row must match exactly (modulo the rename).
    const { game: _g, ...oldRest } = old;
    const { game: _n, ...newRest } = g;
    assert.deepEqual(newRest, oldRest, `${canon}: row differs`);
    if (old.game === canon) report.unchanged += 1;
  }

  console.log(`golden: ${golden.length} old rows -> ${fresh.size} new rows;`, report);
  assert.ok(report.collapsed > 0, 'expected some alias collapses given the committed data');
});
