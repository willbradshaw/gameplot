/**
 * Helpers shared by all scrapers: converting platform values into the RawGame
 * shape, combining duplicate rows, and validating before writing.
 */

import fs from 'fs-extra';
import { parseOrThrow, rawGamesSchema } from '../lib/model.js';

/**
 * Apply the --suffix option to a credential variable name: `PSN_NPSSO`
 * becomes `PSN_NPSSO_UK` for --suffix uk. Lets a user keep several accounts
 * on one platform apart.
 * @param {string} base
 * @param {string} [suffix]
 */
export const suffixedEnvVar = (base, suffix) => (suffix ? `${base}_${suffix.toUpperCase()}` : base);

/**
 * Apply the --suffix option to an output filename: `psn.json` becomes
 * `psn-uk.json` for --suffix uk.
 * @param {string} prefix
 * @param {string} [suffix]
 */
export const suffixedFile = (prefix, suffix) => (suffix ? `${prefix}-${suffix}.json` : `${prefix}.json`);

/**
 * Map over items with at most `limit` calls in flight, preserving order. For
 * platforms that need one request per game.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Round to one decimal place, avoiding float noise like 12.299999. */
export const roundHours = (h) => Math.round(h * 10) / 10;

/**
 * Convert an ISO 8601 timestamp to a YYYY-MM-DD date (UTC).
 * @param {string|null|undefined} iso
 * @returns {string|null}
 */
export function isoToDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable timestamp: ${iso}`);
  return d.toISOString().slice(0, 10);
}

/**
 * Collapse rows that share an id into one, summing hours and keeping the
 * latest date. Platforms occasionally list the same game twice (regional
 * editions, re-releases sharing a concept id). Names must agree: a name
 * mismatch on one id means the scraper's id choice is wrong, so it throws.
 *
 * @param {import('../lib/model.js').RawGame[]} rows
 * @param {import('consola').ConsolaInstance} log
 * @returns {import('../lib/model.js').RawGame[]}
 */
export function combineDuplicateIds(rows, log) {
  const byId = new Map();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, { ...row });
      continue;
    }
    if (existing.game !== row.game) {
      throw new Error(`Id ${row.id} has two names: "${existing.game}" and "${row.game}"`);
    }
    existing.hoursPlayed = roundHours((existing.hoursPlayed ?? 0) + (row.hoursPlayed ?? 0));
    if (row.lastPlayed && (!existing.lastPlayed || row.lastPlayed > existing.lastPlayed)) {
      existing.lastPlayed = row.lastPlayed;
    }
    log.info(`Combined duplicate entries for "${row.game}" (id ${row.id}): ${existing.hoursPlayed}h`);
  }
  return [...byId.values()];
}

/**
 * Validate a scraper's rows against the shared schema and order them by
 * hours played, most first. Throws if anything is off, so a bad row never
 * reaches disk.
 * @param {unknown[]} rows
 * @param {string} label used in error messages
 * @returns {import('../lib/model.js').RawGame[]}
 */
export function finalizeRawGames(rows, label) {
  const games = parseOrThrow(rawGamesSchema, rows, label);
  return games.sort((a, b) => (b.hoursPlayed ?? 0) - (a.hoursPlayed ?? 0) || a.game.localeCompare(b.game));
}

/**
 * @param {string} file
 * @param {import('../lib/model.js').RawGame[]} games
 * @param {import('consola').ConsolaInstance} log
 * @param {Record<string, string>} sources source identifiers mapped to current display labels
 */
export async function writeRawGames(file, games, log, sources) {
  let previous = [];
  try {
    previous = parseOrThrow(rawGamesSchema, await fs.readJson(file), file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const merged = retainMissingGames(previous, parseOrThrow(rawGamesSchema, games, 'scrape'), sources, log);
  await fs.outputJson(file, merged, { spaces: 2 });
  log.success(`Wrote ${merged.length} games to ${file}`);
}

/** Merge history within each source, always preferring fresh records (including lower playtimes). */
export function retainMissingGames(previous, fresh, sources, log) {
  const key = (row) => JSON.stringify([row.source, String(row.id)]);
  const legacyKey = (row) => JSON.stringify([row.platform, String(row.id)]);
  const seen = new Set(fresh.map(key));
  const counts = new Map();
  for (const row of fresh) counts.set(legacyKey(row), (counts.get(legacyKey(row)) ?? 0) + 1);
  // A fresh row already matched to attributed history cannot also cover an
  // unidentified legacy row from another account.
  const matched = new Set();
  for (const row of previous) {
    if (!row.source || !seen.has(key(row)) || matched.has(key(row))) continue;
    matched.add(key(row));
    const labelKey = legacyKey({ ...row, platform: sources[row.source] });
    counts.set(labelKey, (counts.get(labelKey) ?? 0) - 1);
  }
  const retained = [];
  for (const row of previous) {
    let source = row.source;
    if (!source) {
      const candidates = Object.keys(sources).filter((s) => sources[s] === row.platform);
      if (candidates.length === 0) continue;
      if (candidates.length > 1) {
        // Old batch files lack account identities. Only discard an old record
        // when a corresponding fresh row exists; never guess a missing row's account.
        const remaining = counts.get(legacyKey(row)) ?? 0;
        if (!remaining)
          throw new Error(
            `Cannot retain "${row.game}": its old row has no source and matches multiple accounts. Add a source field to that row in the raw file and retry.`,
          );
        counts.set(legacyKey(row), remaining - 1);
        continue;
      }
      [source] = candidates;
    }
    if (!Object.hasOwn(sources, source)) continue;
    const candidate = { ...row, source, platform: sources[source] };
    if (seen.has(key(candidate))) continue;
    seen.add(key(candidate));
    retained.push(candidate);
  }
  if (retained.length) {
    log.warn(
      `Retained ${retained.length} previously scraped games missing from this scrape:\n${retained.map((r) => `  ${r.game} (${r.source}, id ${r.id})`).join('\n')}`,
    );
  }
  return [...fresh, ...retained];
}
