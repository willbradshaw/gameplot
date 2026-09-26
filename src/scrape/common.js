/**
 * Helpers shared by all scrapers: converting platform values into the RawGame
 * shape, combining duplicate rows, and validating before writing.
 */

import { writeJson } from '../lib/json.js';
import { listOf, rawGameSchema } from '../shared/model.js';
import { assertValid } from '../shared/validate.js';

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
 * @param {import('../shared/model.js').RawGame[]} rows
 * @param {{ info: Function }} log
 * @returns {import('../shared/model.js').RawGame[]}
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
 * @returns {import('../shared/model.js').RawGame[]}
 */
export function finalizeRawGames(rows, label) {
  const games = assertValid(rows, listOf(rawGameSchema), label);
  return games.sort((a, b) => (b.hoursPlayed ?? 0) - (a.hoursPlayed ?? 0) || a.game.localeCompare(b.game));
}

/**
 * @param {string} file
 * @param {import('../shared/model.js').RawGame[]} games
 * @param {{ info: Function }} log
 */
export async function writeRawGames(file, games, log) {
  await writeJson(file, games);
  log.info(`Wrote ${games.length} games to ${file}`);
}
