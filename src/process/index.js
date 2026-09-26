/**
 * The `process` stage: raw scraper output + manual files -> dashboard data.
 *
 * Reads
 *   <dataDir>/games-raw/{steam-games,psn-games-uk,psn-games-us,xbox-games,gog-games-raw}.json
 *   <dataDir>/manual/gog-annotations.json
 *   <dataDir>/manual/annotations.json
 *
 * Writes
 *   <outDir>/games-processed/gog-games-annotated.json   (intermediate)
 *   <outDir>/games-processed/merged-platforms.json      (intermediate)
 *   <outDir>/games-processed/annotated-games.json       (what the dashboard loads)
 *   <outDir>/manual/blank-annotations.json              (stubs for unannotated games)
 *
 * `runProcess` is also usable without touching disk for outputs: pass
 * `write: false` and use the returned result, which is how the tests drive it.
 */

import path from 'node:path';
import { writeJson } from '../lib/json.js';
import { annotatedGameSchema, listOf, mergedGameSchema } from '../shared/model.js';
import { assertValid } from '../shared/validate.js';
import { annotate, blankAnnotations } from './annotate.js';
import { applyGogAnnotations } from './gogAnnotations.js';
import { loadAnnotations, loadGogAnnotations, loadRawGames } from './loaders.js';
import { mergePlatforms } from './mergePlatforms.js';

/** Scraper output files, relative to <dataDir>/games-raw. GOG is handled separately. */
export const RAW_FILES = {
  steam: 'steam-games.json',
  'psn-uk': 'psn-games-uk.json',
  'psn-us': 'psn-games-us.json',
  xbox: 'xbox-games.json',
};
export const GOG_RAW_FILE = 'gog-games-raw.json';

/**
 * @param {object} options
 * @param {string} options.dataDir   directory holding games-raw/ and manual/
 * @param {string} [options.outDir]  where to write outputs; defaults to dataDir
 * @param {boolean} [options.write]  set false to skip writing files
 * @param {{ info: Function, warn: Function, debug: Function }} options.log
 */
export async function runProcess({ dataDir, outDir = dataDir, write = true, log }) {
  const rawDir = path.join(dataDir, 'games-raw');
  const manualDir = path.join(dataDir, 'manual');

  // 1. Load and validate inputs.
  const raw = [];
  for (const [platform, file] of Object.entries(RAW_FILES)) {
    const games = await loadRawGames(path.join(rawDir, file), log);
    log.info(`${platform}: ${games.length} games`);
    raw.push(...games);
  }
  const gogRaw = await loadRawGames(path.join(rawDir, GOG_RAW_FILE), log);
  const gogAnnotations = await loadGogAnnotations(path.join(manualDir, 'gog-annotations.json'), log);
  const annotations = await loadAnnotations(path.join(manualDir, 'annotations.json'), log);

  // 2. Transform.
  const gogGames = applyGogAnnotations(gogRaw, gogAnnotations, log);
  const merged = mergePlatforms([...raw, ...gogGames]);
  log.info(`Merged ${raw.length + gogGames.length} platform rows into ${merged.size} games`);
  const result = annotate(merged, annotations, log);

  // 3. Validate outputs against the shared schemas before anything is written.
  const mergedList = [...merged.values()];
  assertValid(mergedList, listOf(mergedGameSchema), 'merged-platforms output');
  assertValid(result.games, listOf(annotatedGameSchema), 'annotated-games output');

  const outputs = {
    'games-processed/gog-games-annotated.json': gogGames,
    'games-processed/merged-platforms.json': mergedList,
    'games-processed/annotated-games.json': result.games,
    'manual/blank-annotations.json': blankAnnotations(result.unannotated),
  };

  if (write) {
    for (const [rel, data] of Object.entries(outputs)) {
      const target = path.join(outDir, rel);
      await writeJson(target, data);
      log.info(`Wrote ${target}`);
    }
  }

  return { ...result, merged: mergedList, gogGames, outputs };
}
