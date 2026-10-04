/**
 * `gameplot scrape batch`: run several sources and combine their rows.
 *
 * A source is `platform` or `platform:suffix`, so `steam,psn:uk,psn,xbox,gog`
 * scrapes five sources. Each runs exactly as its single-platform command
 * would; a failure in one does not stop the others, but the combined file is
 * written only when every source succeeded, so a previous good file is never
 * replaced by a partial one.
 */

import path from 'node:path';
import { InvalidArgumentError } from 'commander';
import { RAW_DATA_DIR, saveEnvVar } from '../lib/env.js';
import { suffixedEnvVar, suffixedFile, writeRawGames } from './common.js';
import { GOG_PLATFORM, scrapeGogAccount } from './gog.js';
import { PSN_PLATFORM, scrapePsnAccount } from './psn.js';
import { STEAM_PLATFORM, scrapeSteamAccount } from './steam.js';
import { scrapeXboxAccount, XBOX_PLATFORM } from './xbox.js';

const REGISTRY = {
  psn: { scrape: scrapePsnAccount, label: PSN_PLATFORM },
  steam: { scrape: scrapeSteamAccount, label: STEAM_PLATFORM },
  xbox: { scrape: scrapeXboxAccount, label: XBOX_PLATFORM },
  gog: { scrape: scrapeGogAccount, label: GOG_PLATFORM },
};
export const PLATFORM_NAMES = Object.keys(REGISTRY);

const SOURCE_RE = /^([a-z]+)(?::([a-z0-9-]+))?$/;

/** Default output filename, with the batch --suffix applied. */
export const batchOutputFile = (suffix) => suffixedFile('batch', suffix);

/** Environment variable remembering the last source list, with the batch --suffix applied. */
export const batchEnvVar = (suffix) => suffixedEnvVar('GAMEPLOT_BATCH', suffix);

/**
 * Decide which sources to run: the list given on the command line, or else
 * the one remembered in the environment from the last run with this suffix.
 * @param {object} options
 * @param {{ platform: string, suffix?: string }[]} [options.given]  parsed command-line list
 * @param {string} [options.suffix]
 * @param {NodeJS.ProcessEnv} options.env
 * @param {string[]} options.platforms
 * @returns {{ sources: {platform: string, suffix?: string}[], remembered: boolean }}
 */
export function resolveSources({ given, suffix, env, platforms }) {
  if (given) return { sources: given, remembered: false };
  const envVar = batchEnvVar(suffix);
  const stored = env[envVar];
  if (!stored) {
    throw new Error(
      `No source list given and ${envVar} is not set. Run once with a list, e.g. ` +
        `"gameplot scrape batch steam,psn,xbox,gog"; it is then remembered for next time.`,
    );
  }
  return { sources: parseSources(stored, platforms), remembered: true };
}

/**
 * Parse a comma-separated source list.
 * @param {string} text
 * @param {string[]} platforms  known platform names
 * @returns {{ platform: string, suffix: string|undefined }[]}
 */
export function parseSources(text, platforms) {
  const entries = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new InvalidArgumentError('no sources given');
  const seen = new Set();
  return entries.map((entry) => {
    // The label keeps its case and may contain spaces; everything before it is lower-cased.
    const eq = entry.indexOf('=');
    const head = (eq === -1 ? entry : entry.slice(0, eq)).toLowerCase();
    const label = eq === -1 ? undefined : entry.slice(eq + 1).trim() || undefined;
    const m = SOURCE_RE.exec(head);
    if (!m)
      throw new InvalidArgumentError(
        `"${entry}" is not platform, platform:suffix or platform[:suffix]=label`,
      );
    const [, platform, suffix] = m;
    if (!platforms.includes(platform)) {
      throw new InvalidArgumentError(`unknown platform "${platform}" (known: ${platforms.join(', ')})`);
    }
    if (seen.has(head)) throw new InvalidArgumentError(`"${head}" is listed twice`);
    seen.add(head);
    return { platform, suffix, label };
  });
}

/** Human-readable name of a source, e.g. "psn:uk". */
export const sourceName = ({ platform, suffix, label }) =>
  `${platform}${suffix ? `:${suffix}` : ''}${label ? `=${label}` : ''}`;

/**
 * Run each source in order, collecting rows and failures.
 * @param {object} options
 * @param {{ platform: string, suffix?: string }[]} options.sources
 * @param {Record<string, { scrape: Function }>} options.registry  platform name -> scraper
 * @param {string} [options.defaultSuffix]  the batch --suffix, used by sources without their own
 * @param {import('consola').ConsolaInstance} options.log
 * @returns {Promise<{ rows: object[], failures: { source: string, error: Error }[], sourceLabels: Record<string, string> }>}
 */
export async function runBatch({ sources, registry, defaultSuffix, log }) {
  const rows = [];
  const failures = [];
  const sourceLabels = {};
  for (const source of sources) {
    const resolved = { ...source, suffix: source.suffix ?? defaultSuffix };
    const name = sourceName(resolved);
    const sourceId = sourceName({ ...resolved, label: undefined });
    if (Object.hasOwn(sourceLabels, sourceId)) throw new Error(`Duplicate resolved source: ${sourceId}`);
    sourceLabels[sourceId] = resolved.label ?? registry[source.platform].label;
    log.info(`Fetching from ${name}`);
    try {
      const games = await registry[source.platform].scrape({
        suffix: resolved.suffix,
        platform: resolved.label,
        log,
      });
      sourceLabels[sourceId] ??= games[0]?.platform;
      rows.push(...games.map((game) => ({ ...game, source: sourceId })));
    } catch (error) {
      if (['ExitPromptError', 'AbortPromptError', 'AbortError'].includes(error.name)) throw error;
      log.error(`${name} failed: ${error.message}`);
      failures.push({ source: name, error });
    }
  }
  return { rows, failures, sourceLabels };
}

/** Shared batch stage for the scrape command and the pipeline. */
export async function runScrapeBatch({
  given,
  suffix,
  out,
  log,
  env = process.env,
  registry = REGISTRY,
  saveEnv = saveEnvVar,
}) {
  const { sources, remembered } = resolveSources({ given, suffix, env, platforms: Object.keys(registry) });
  if (remembered) log.info(`Using remembered sources: ${sources.map(sourceName).join(',')}`);
  else await saveEnv(batchEnvVar(suffix), sources.map(sourceName).join(','));
  const { rows, failures, sourceLabels } = await runBatch({ sources, registry, defaultSuffix: suffix, log });
  if (failures.length)
    throw new Error(
      `${failures.length} of ${sources.length} sources failed (${failures.map((f) => f.source).join(', ')}); nothing written`,
    );
  log.info(`${rows.length} rows from ${sources.map(sourceName).join(', ')}`);
  await writeRawGames(out ?? path.join(RAW_DATA_DIR, batchOutputFile(suffix)), rows, log, sourceLabels);
}
