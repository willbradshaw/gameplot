/**
 * Read and validate the pipeline's input files.
 *
 * Every loader returns a normalised array of records and throws with a
 * file-specific message when a file does not match its schema. Hand-edited
 * files (annotations) are read leniently: legacy field names are translated
 * and numeric strings are coerced, each with a logged warning, so a typo in
 * a manual file is surfaced rather than silently propagated.
 */

import { readJson } from '../lib/json.js';
import {
  annotationSchema,
  gogAnnotationSchema,
  listOf,
  MIN_VALID_DATE,
  rawGameSchema,
} from '../shared/model.js';
import { assertValid } from '../shared/validate.js';

/**
 * Legacy annotation keys from the Python pipeline, which overrode the
 * computed totals by plain key collision. They are read as the explicit
 * override fields until the migration script rewrites the file at cutover.
 */
const LEGACY_ANNOTATION_KEYS = {
  hoursPlayedTotal: 'hoursPlayedOverride',
  lastPlayedTotal: 'lastPlayedOverride',
};

/**
 * Throw if any record name appears twice. Every stage keys on `game`, so a
 * duplicate would silently drop data.
 * @param {{ game: string }[]} records
 * @param {string} label
 */
export function assertUniqueNames(records, label) {
  const seen = new Set();
  const dupes = new Set();
  for (const r of records) (seen.has(r.game) ? dupes : seen).add(r.game);
  if (dupes.size) {
    throw new Error(`Duplicate game names in ${label}: ${[...dupes].map((d) => `"${d}"`).join(', ')}`);
  }
}

/**
 * Load one scraper output file.
 * @param {string} filePath
 * @param {{ warn: Function }} log
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function loadRawGames(filePath, log) {
  const data = await readJson(filePath);
  const games = assertValid(data, listOf(rawGameSchema), filePath, {
    onWarning: (w) => log.warn(`${w.path}: ${w.message}`),
  });
  assertUniqueNames(games, filePath);

  // Ids must be unique within a platform file: two rows with one id would
  // mean the scraper's own de-duplication failed.
  const ids = new Set();
  for (const g of games) {
    if (ids.has(g.id)) throw new Error(`Duplicate id ${g.id} in ${filePath}`);
    ids.add(g.id);
  }

  for (const g of games) {
    if (g.lastPlayed !== null && g.lastPlayed < MIN_VALID_DATE) {
      log.warn(`${filePath}: "${g.game}" has implausible lastPlayed ${g.lastPlayed}; treating as unknown`);
      g.lastPlayed = null;
    }
  }
  return games;
}

/**
 * @param {string} filePath
 * @param {{ warn: Function }} log
 * @returns {Promise<import('../shared/model.js').GogAnnotation[]>}
 */
export async function loadGogAnnotations(filePath, log) {
  const data = await readJson(filePath);
  const rows = assertValid(data, listOf(gogAnnotationSchema), filePath, {
    onWarning: (w) => log.warn(`${w.path}: ${w.message}`),
  });
  assertUniqueNames(rows, filePath);
  return rows;
}

/**
 * @param {string} filePath
 * @param {{ warn: Function }} log
 * @returns {Promise<import('../shared/model.js').Annotation[]>}
 */
export async function loadAnnotations(filePath, log) {
  const data = await readJson(filePath);
  if (!Array.isArray(data)) throw new Error(`${filePath}: expected an array of annotations`);

  const legacyUses = [];
  const translated = data.map((row) => {
    if (typeof row !== 'object' || row === null) return row;
    const out = { ...row };
    for (const [legacy, modern] of Object.entries(LEGACY_ANNOTATION_KEYS)) {
      if (legacy in out) {
        legacyUses.push(`"${row.game}" (${legacy})`);
        out[modern] = out[legacy];
        delete out[legacy];
      }
    }
    return out;
  });
  if (legacyUses.length) {
    log.warn(
      `${filePath}: ${legacyUses.length} annotations use legacy override keys ` +
        `(hoursPlayedTotal/lastPlayedTotal -> hoursPlayedOverride/lastPlayedOverride): ${legacyUses.join(', ')}`,
    );
  }

  const annotations = assertValid(translated, listOf(annotationSchema), filePath, {
    onWarning: (w) => log.warn(`${w.path}: ${w.message}`),
  });
  assertUniqueNames(annotations, filePath);
  return annotations;
}
