/**
 * `gameplot process`: scraped rows + annotations -> data/games.json.
 * See docs/process.md for the rules; `processGames` is the pure core and
 * `runProcess` does the file handling around it.
 */

import fs from 'fs-extra';
import { gamesSchema, parseOrThrow, rawGamesSchema } from '../lib/model.js';
import { buildAliasMap, checkTags, loadAnnotations, loadTags, suggestAliases } from './annotations.js';

/** Which platform's url to show when a game is on several. First match wins. */
const DISPLAY_URL_PREFERENCE = ['Steam', 'PS5'];

const roundHours = (h) => Math.round(h * 10) / 10;
const later = (a, b) => (a === null ? b : b === null ? a : a >= b ? a : b);

/** Thrown when the playtime rules in docs/process.md are broken. */
export class PlaytimeRuleError extends Error {}

/**
 * Combine the rows of one game that share a platform label into one platform
 * element (docs/process.md, Merging step 1). Hours are summed, treating null
 * as unknown: the result is null only if every row's hours are null.
 * @param {string} platform
 * @param {import('../lib/model.js').RawGame[]} rows
 */
export function combinePlatformRows(platform, rows) {
  const withHours = rows.filter((r) => r.hoursPlayed !== null);
  const hoursPlayed = withHours.length ? roundHours(withHours.reduce((s, r) => s + r.hoursPlayed, 0)) : null;
  const lastPlayed = rows.reduce((d, r) => later(d, r.lastPlayed), null);
  const latest = rows.find((r) => r.lastPlayed !== null && r.lastPlayed === lastPlayed) ?? rows[0];
  return { platform, hoursPlayed, lastPlayed, id: latest.id, url: latest.url };
}

/**
 * Combine platform rows and apply annotation playtime corrections.
 * @param {import('../lib/model.js').Annotation} annotation
 * @param {import('../lib/model.js').RawGame[]} rows
 */
export function buildPlatforms(annotation, rows) {
  const byPlatform = new Map();
  for (const row of rows) {
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []);
    byPlatform.get(row.platform).push(row);
  }
  const elements = [...byPlatform].map(([platform, group]) => combinePlatformRows(platform, group));

  const ignoredCorrections = [];
  for (const [platform, correction] of Object.entries(annotation.playtime ?? {})) {
    const element = elements.find((e) => e.platform === platform);
    if (!element) {
      ignoredCorrections.push(
        `"${annotation.game}": playtime correction for ${platform}, but it was not scraped there`,
      );
      continue;
    }
    if (correction.hoursPlayed !== undefined) element.hoursPlayed = correction.hoursPlayed;
    if (correction.lastPlayed !== undefined) element.lastPlayed = correction.lastPlayed;
  }

  return { elements, ignoredCorrections };
}

/** Build and validate a rated game’s dashboard entry. */
export function buildGame(annotation, rows) {
  const { elements, ignoredCorrections } = buildPlatforms(annotation, rows);
  const violations = [];
  for (const e of elements) {
    if (e.hoursPlayed === null) {
      violations.push(
        `"${annotation.game}" has no playtime on ${e.platform}; set playtime.${e.platform}.hoursPlayed (0 if unplayed there)`,
      );
    } else if (e.hoursPlayed > 0 && e.lastPlayed === null) {
      violations.push(
        `"${annotation.game}" has playtime on ${e.platform} but no date; set playtime.${e.platform}.lastPlayed`,
      );
    }
  }
  const lastPlayedTotal = elements.reduce((d, e) => later(d, e.lastPlayed), null);
  if (!violations.length && lastPlayedTotal === null) {
    violations.push(`"${annotation.game}" has no playtime on any platform; supply some or remove its rating`);
  }
  if (violations.length) return { game: null, ignoredCorrections, violations };

  elements.sort((a, b) => b.hoursPlayed - a.hoursPlayed || a.platform.localeCompare(b.platform));
  const preferred = DISPLAY_URL_PREFERENCE.map((p) => elements.find((e) => e.platform === p)?.url).find(
    Boolean,
  );
  const game = {
    game: annotation.game,
    platforms: elements.map((e) => e.platform),
    ids: elements.map((e) => e.id),
    urls: elements.map((e) => e.url),
    hoursPlayedSingle: elements.map((e) => e.hoursPlayed),
    lastPlayedSingle: elements.map((e) => e.lastPlayed),
    hoursPlayedTotal: roundHours(elements.reduce((s, e) => s + e.hoursPlayed, 0)),
    lastPlayedTotal,
    displayUrl: preferred ?? elements.map((e) => e.url).find(Boolean) ?? null,
    rating: annotation.rating,
    status: annotation.status,
    tags: [...annotation.tags],
  };
  return { game, ignoredCorrections, violations };
}

/**
 * The pure core: rows and annotations in, games and reports out.
 * @param {import('../lib/model.js').RawGame[]} rows
 * @param {import('../lib/model.js').Annotation[]} annotations
 * @returns {{
 *   games: import('../lib/model.js').Game[],
 *   unannotated: string[], unmatched: string[], unrated: string[], ignoredCorrections: string[],
 * }}
 */
export function processGames(rows, annotations) {
  const aliasTo = buildAliasMap(annotations);
  const byName = new Map(annotations.map((a) => [a.game, a]));

  const groups = new Map();
  for (const row of rows) {
    const canonical = aliasTo.get(row.game) ?? row.game;
    if (!groups.has(canonical)) groups.set(canonical, []);
    groups.get(canonical).push(row);
  }

  const games = [];
  const unannotated = [];
  const unrated = [];
  const ignoredCorrections = [];
  const violations = [];
  for (const [name, group] of groups) {
    const annotation = byName.get(name);
    if (!annotation) {
      // Owned-but-never-played rows (null hours, e.g. GOG) are nothing to annotate.
      if (group.some((r) => r.hoursPlayed !== null)) unannotated.push(name);
      continue;
    }
    if (annotation.status === 'Unplayed') {
      const built = buildPlatforms(annotation, group);
      ignoredCorrections.push(...built.ignoredCorrections);
      for (const element of built.elements) {
        if (element.hoursPlayed > 0) {
          violations.push(
            `"${name}" is Unplayed but has playtime on ${element.platform}; set playtime.${element.platform}.hoursPlayed to 0 or change its status`,
          );
        }
      }
      continue;
    }
    if (annotation.rating === null) {
      unrated.push(name);
      continue;
    }
    const built = buildGame(annotation, group);
    ignoredCorrections.push(...built.ignoredCorrections);
    violations.push(...built.violations);
    if (built.game) games.push(built.game);
  }
  if (violations.length) {
    throw new PlaytimeRuleError(
      `Playtime rules broken for ${violations.length} game(s):\n  ${violations.join('\n  ')}`,
    );
  }
  const unmatched = annotations.filter((a) => !groups.has(a.game)).map((a) => a.game);

  games.sort((a, b) => a.game.localeCompare(b.game));
  return {
    games,
    unannotated: unannotated.sort(),
    unmatched: unmatched.sort(),
    unrated: unrated.sort(),
    ignoredCorrections,
  };
}

/** Fill-in entries for games that need an annotation. */
export const blankAnnotations = (names) =>
  names.map((game) => ({ game, rating: null, status: null, tags: [] }));

/**
 * Read the inputs, process, report, and write the outputs.
 * @param {object} options
 * @param {string} options.input  scraped rows file
 * @param {string} options.annotationsFile
 * @param {string} options.out
 * @param {import('consola').ConsolaInstance} options.log
 */
export async function runProcess({ input, annotationsFile, tagsFile, out, log }) {
  const rows = parseOrThrow(rawGamesSchema, await fs.readJson(input), input);
  const annotations = await loadAnnotations(annotationsFile);
  checkTags(annotations, await loadTags(tagsFile), annotationsFile);
  log.info(`${rows.length} scraped rows, ${annotations.length} annotations`);

  const result = processGames(rows, annotations);
  parseOrThrow(gamesSchema, result.games, 'processed games');

  for (const msg of result.ignoredCorrections) log.warn(msg);
  if (result.unannotated.length) {
    log.warn(
      `${result.unannotated.length} scraped games have no annotation:\n  ${result.unannotated.join('\n  ')}`,
    );
  }
  if (result.unmatched.length) {
    log.warn(
      `${result.unmatched.length} annotations match no scraped game:\n  ${result.unmatched.join('\n  ')}`,
    );
  }
  if (result.unrated.length) {
    log.info(`${result.unrated.length} annotated games are not yet rated (--verbose lists them)`);
    for (const name of result.unrated) log.debug(`  unrated: ${name}`);
  }

  const candidates = annotations.filter((a) => result.unmatched.includes(a.game));
  const blanks = blankAnnotations(result.unannotated);
  for (const entry of blanks) {
    const targets = suggestAliases(entry.game, candidates);
    if (targets.length) entry.possible_aliases = targets;
  }
  const updatedAnnotations = [...annotations, ...blanks].sort((a, b) => a.game.localeCompare(b.game, 'en'));

  await fs.outputJson(out, result.games, { spaces: 2 });
  log.success(`Wrote ${result.games.length} games to ${out}`);
  if (JSON.stringify(updatedAnnotations) !== JSON.stringify(annotations)) {
    await fs.outputJson(annotationsFile, updatedAnnotations, { spaces: 2 });
    log.info(`Added ${result.unannotated.length} games and sorted ${annotationsFile}`);
  }
  const pendingAliases = updatedAnnotations.filter((a) => a.possible_aliases).length;
  if (pendingAliases) {
    log.info(
      `${pendingAliases} game${pendingAliases === 1 ? ' has' : 's have'} suggested aliases to review; run gameplot annotate`,
    );
  }
  return result;
}
