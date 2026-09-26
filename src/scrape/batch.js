/**
 * `gameplot scrape batch`: run several sources and combine their rows.
 *
 * A source is `platform` or `platform:suffix`, so `steam,psn:uk,psn,xbox,gog`
 * scrapes five sources. Each runs exactly as its single-platform command
 * would; a failure in one does not stop the others, but the combined file is
 * written only when every source succeeded, so a previous good file is never
 * replaced by a partial one.
 */

import { InvalidArgumentError } from 'commander';

const SOURCE_RE = /^([a-z]+)(?::([a-z0-9-]+))?$/;

/**
 * Parse a comma-separated source list.
 * @param {string} text
 * @param {string[]} platforms  known platform names
 * @returns {{ platform: string, suffix: string|undefined }[]}
 */
export function parseSources(text, platforms) {
  const entries = text
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) throw new InvalidArgumentError('no sources given');
  const seen = new Set();
  return entries.map((entry) => {
    const m = SOURCE_RE.exec(entry);
    if (!m) throw new InvalidArgumentError(`"${entry}" is not platform or platform:suffix`);
    const [, platform, suffix] = m;
    if (!platforms.includes(platform)) {
      throw new InvalidArgumentError(`unknown platform "${platform}" (known: ${platforms.join(', ')})`);
    }
    if (seen.has(entry)) throw new InvalidArgumentError(`"${entry}" is listed twice`);
    seen.add(entry);
    return { platform, suffix };
  });
}

/** Human-readable name of a source, e.g. "psn:uk". */
export const sourceName = ({ platform, suffix }) => (suffix ? `${platform}:${suffix}` : platform);

/**
 * Run each source in order, collecting rows and failures.
 * @param {object} options
 * @param {{ platform: string, suffix?: string }[]} options.sources
 * @param {Record<string, { scrape: Function }>} options.registry  platform name -> scraper
 * @param {import('consola').ConsolaInstance} options.log
 * @returns {Promise<{ rows: object[], failures: { source: string, error: Error }[] }>}
 */
export async function runBatch({ sources, registry, log }) {
  const rows = [];
  const failures = [];
  for (const source of sources) {
    const name = sourceName(source);
    log.box(name);
    try {
      const games = await registry[source.platform].scrape({ suffix: source.suffix, log });
      rows.push(...games);
    } catch (error) {
      log.error(`${name} failed: ${error.message}`);
      failures.push({ source: name, error });
    }
  }
  return { rows, failures };
}
