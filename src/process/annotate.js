/**
 * Join merged platform data with the manual annotations to produce the
 * dashboard's records.
 *
 * Steps, in order:
 *
 *  1. Alias resolution. Each annotation may list `aliases`: other spellings
 *     the platforms use for the same game. Every merged row whose name is an
 *     alias is folded into the row for the canonical name, so a game bought
 *     on Steam as "Slay the Spire" and on Xbox as "Slay The Spire" becomes one
 *     two-platform row called "Slay the Spire".
 *
 *  2. Inner join. A game reaches the output only if it has platform data AND
 *     an annotation with a non-null rating. Unrated annotations are treated
 *     as a to-do list; platform games with no annotation at all are reported
 *     back so the user can write one (see `unannotated`).
 *
 *  3. Overrides. `hoursPlayedOverride` replaces the scraped total and the
 *     per-platform hours are scaled proportionally so they still sum to it.
 *     `lastPlayedOverride` replaces the total date; on a single-platform game
 *     it also replaces that platform's date so the two never disagree.
 *
 *  4. Presentation. Per-platform arrays are ordered by hours, and a
 *     `displayUrl` is chosen by platform preference.
 */

import { roundHours } from '../lib/hours.js';
import { DISPLAY_URL_PREFERENCE } from '../shared/model.js';
import { mergeInto, sortPlatformsByHours } from './mergePlatforms.js';

/**
 * Build alias -> canonical name lookup, rejecting ambiguous configurations.
 * @param {import('../shared/model.js').Annotation[]} annotations
 * @returns {Map<string, string>}
 */
export function buildAliasMap(annotations) {
  const canonical = new Set(annotations.map((a) => a.game));
  const aliasTo = new Map();
  for (const a of annotations) {
    for (const alias of a.aliases ?? []) {
      if (alias === a.game) continue;
      if (canonical.has(alias)) {
        throw new Error(`Alias "${alias}" of "${a.game}" is also a canonical annotation name`);
      }
      const prior = aliasTo.get(alias);
      if (prior && prior !== a.game) {
        throw new Error(`Alias "${alias}" is claimed by both "${prior}" and "${a.game}"`);
      }
      aliasTo.set(alias, a.game);
    }
  }
  return aliasTo;
}

/**
 * Rename and merge rows so every game is keyed by its canonical name.
 * Does not mutate the input map or its rows.
 * @param {Map<string, import('../shared/model.js').MergedGame>} merged
 * @param {Map<string, string>} aliasTo
 * @returns {Map<string, import('../shared/model.js').MergedGame>}
 */
export function canonicalize(merged, aliasTo) {
  const out = new Map();
  for (const [name, row] of merged) {
    const canon = aliasTo.get(name) ?? name;
    const copy = structuredClone(row);
    copy.game = canon;
    const existing = out.get(canon);
    if (existing) mergeInto(existing, copy);
    else out.set(canon, copy);
  }
  for (const row of out.values()) sortPlatformsByHours(row);
  return out;
}

/**
 * Apply an annotation's override fields to a merged row, in place.
 * @param {import('../shared/model.js').MergedGame} row
 * @param {import('../shared/model.js').Annotation} annotation
 */
export function applyOverrides(row, annotation) {
  if (annotation.hoursPlayedOverride !== undefined) {
    const target = annotation.hoursPlayedOverride;
    const current = row.hoursPlayedTotal;
    if (row.platforms.length === 1 || current === 0) {
      // Nothing to apportion: give it all to the first (most-played) platform.
      row.hoursPlayedSingle = row.hoursPlayedSingle.map((_, i) => (i === 0 ? target : 0));
    } else {
      const scaled = row.hoursPlayedSingle.map((h) => roundHours((h / current) * target));
      // Absorb rounding drift into the largest platform so the sum is exact.
      const drift = roundHours(target - scaled.reduce((s, h) => s + h, 0));
      scaled[0] = roundHours(scaled[0] + drift);
      row.hoursPlayedSingle = scaled;
    }
    row.hoursPlayedTotal = target;
  }
  if (annotation.lastPlayedOverride !== undefined) {
    row.lastPlayedTotal = annotation.lastPlayedOverride;
    if (row.platforms.length === 1) row.lastPlayedSingle = [annotation.lastPlayedOverride];
  }
}

/**
 * @param {import('../shared/model.js').MergedGame} row
 * @returns {string|null}
 */
export function chooseDisplayUrl(row) {
  for (const platform of DISPLAY_URL_PREFERENCE) {
    const i = row.platforms.indexOf(platform);
    if (i !== -1 && row.urls[i]) return row.urls[i];
  }
  return row.urls.find((u) => u) ?? null;
}

/**
 * @typedef {object} AnnotateResult
 * @property {import('../shared/model.js').AnnotatedGame[]} games  sorted by name
 * @property {string[]} unannotated  platform games with no matching annotation or alias
 * @property {string[]} unrated      annotated games present in platform data but with rating null
 * @property {string[]} unmatched    annotations (rated or not) with no platform data at all
 */

/**
 * @param {Map<string, import('../shared/model.js').MergedGame>} merged  keyed by raw game name
 * @param {import('../shared/model.js').Annotation[]} annotations
 * @param {{ info: Function, warn: Function }} log
 * @returns {AnnotateResult}
 */
export function annotate(merged, annotations, log) {
  const aliasTo = buildAliasMap(annotations);
  const canon = canonicalize(merged, aliasTo);
  const byName = new Map(annotations.map((a) => [a.game, a]));

  const games = [];
  const unannotated = [];
  const unrated = [];
  for (const [name, row] of canon) {
    const annotation = byName.get(name);
    if (!annotation) {
      unannotated.push(name);
      continue;
    }
    if (annotation.rating === null) {
      unrated.push(name);
      continue;
    }
    applyOverrides(row, annotation);
    sortPlatformsByHours(row);
    games.push({
      ...row,
      rating: annotation.rating,
      status: annotation.status,
      tags: [...annotation.tags],
      displayUrl: chooseDisplayUrl(row),
    });
  }
  const unmatched = annotations.filter((a) => !canon.has(a.game)).map((a) => a.game);

  games.sort((a, b) => a.game.localeCompare(b.game));
  unannotated.sort();
  unrated.sort();
  unmatched.sort();

  log.info(`Annotated ${games.length} games (${aliasTo.size} aliases folded ${merged.size} rows into ${canon.size})`);
  if (unrated.length) {
    log.info(`${unrated.length} games have platform data but no rating yet (run with --verbose to list them)`);
    log.debug(`Awaiting a rating: ${unrated.join(', ')}`);
  }
  if (unannotated.length) log.warn(`${unannotated.length} platform games have no annotation: ${unannotated.join(', ')}`);
  if (unmatched.length) log.warn(`${unmatched.length} annotations match no platform data: ${unmatched.join(', ')}`);

  return { games, unannotated, unrated, unmatched };
}

/**
 * Blank annotation stubs for games that need one, ready to paste into
 * annotations.json.
 * @param {string[]} names
 * @returns {import('../shared/model.js').Annotation[]}
 */
export function blankAnnotations(names) {
  return names.map((game) => ({ game, rating: null, status: null, tags: [] }));
}
