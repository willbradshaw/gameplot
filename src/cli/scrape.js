/**
 * `gameplot scrape <platform>` and `gameplot scrape batch <sources>`. This
 * module only declares options and calls src/scrape/. See docs/scrape.md.
 */

import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { RAW_DATA_DIR, saveEnvVar } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import {
  batchEnvVar,
  batchOutputFile,
  parseSources,
  resolveSources,
  runBatch,
  sourceName,
} from '../scrape/batch.js';
import { writeRawGames } from '../scrape/common.js';
import { GOG_PLATFORM, gogOutputFile, scrapeGogAccount } from '../scrape/gog.js';
import { PSN_PLATFORM, psnOutputFile, scrapePsnAccount } from '../scrape/psn.js';
import { STEAM_PLATFORM, scrapeSteamAccount, steamOutputFile } from '../scrape/steam.js';
import { scrapeXboxAccount, XBOX_PLATFORM, xboxOutputFile } from '../scrape/xbox.js';

/** Every platform, in the order shown in help. `scrape({ suffix, platform?, log })` returns rows. */
const PLATFORMS = [
  {
    name: 'psn',
    summary: 'download from PlayStation Network',
    description: 'download playtime data from one PlayStation Network account',
    defaultPlatform: PSN_PLATFORM,
    outputFile: psnOutputFile,
    scrape: scrapePsnAccount,
  },
  {
    name: 'steam',
    summary: 'download from Steam',
    description: 'download playtime data for one Steam account via the Steam Web API',
    defaultPlatform: STEAM_PLATFORM,
    outputFile: steamOutputFile,
    scrape: scrapeSteamAccount,
  },
  {
    name: 'xbox',
    summary: 'download from Xbox',
    description: 'download playtime data for one Xbox account via the OpenXBL API',
    defaultPlatform: XBOX_PLATFORM,
    outputFile: xboxOutputFile,
    scrape: scrapeXboxAccount,
  },
  {
    name: 'gog',
    summary: 'download from GOG',
    description: 'download the owned-games list of one GOG account',
    defaultPlatform: GOG_PLATFORM,
    outputFile: gogOutputFile,
    scrape: scrapeGogAccount,
  },
];
const PLATFORM_NAMES = PLATFORMS.map((p) => p.name);
const REGISTRY = Object.fromEntries(PLATFORMS.map((p) => [p.name, p]));

function parseSuffix(value) {
  const suffix = value.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(suffix)) {
    throw new InvalidArgumentError('must be letters, digits or dashes (it becomes part of a filename)');
  }
  return suffix;
}

const withLogOptions = (command) =>
  command.option('-v, --verbose', 'show debug output').option('-q, --quiet', 'only show warnings and errors');

/** One platform's subcommand: common options plus an action that scrapes and writes. */
function platformCommand({ name, summary, description, defaultPlatform, outputFile, scrape }) {
  return withLogOptions(
    new Command(name)
      .summary(summary)
      .description(description)
      .option(
        '-s, --suffix <suffix>',
        'optional; appended to the credential variable name and output filename, to keep several accounts on one platform apart',
        parseSuffix,
      )
      .option('-l, --label <label>', 'platform display name written to each row', defaultPlatform)
      .option('-o, --out <file>', `output file (default: data/raw/${outputFile()})`),
  ).action(async (opts) => {
    const log = createLogger(opts);
    const games = await scrape({ suffix: opts.suffix, platform: opts.label, log });
    await writeRawGames(opts.out ?? path.join(RAW_DATA_DIR, outputFile(opts.suffix)), games, log);
  });
}

const batch = withLogOptions(
  new Command('batch')
    .summary('download from several sources into one file')
    .description(
      'download playtime data from a comma-separated list of sources, each ' +
        `platform[:suffix][=label] (platforms: ${PLATFORM_NAMES.join(', ')}), and write every row to one file; ` +
        'the list is remembered in .env, so later runs can omit it; ' +
        'the file is written only if every source succeeds',
    )
    .argument('[sources]', 'e.g. steam,psn:uk=PS4,psn,xbox,gog (default: the last list used)', (value) =>
      parseSources(value, PLATFORM_NAMES),
    )
    .option(
      '-s, --suffix <suffix>',
      'optional; appended to the output filename and used by sources that have no suffix of their own',
      parseSuffix,
    )
    .option('-o, --out <file>', `output file (default: data/raw/${batchOutputFile()})`),
).action(async (given, opts) => {
  const log = createLogger(opts);
  const { sources, remembered } = resolveSources({
    given,
    suffix: opts.suffix,
    env: process.env,
    platforms: PLATFORM_NAMES,
  });
  if (remembered) log.info(`Using remembered sources: ${sources.map(sourceName).join(',')}`);
  else await saveEnvVar(batchEnvVar(opts.suffix), sources.map(sourceName).join(','));
  const { rows, failures } = await runBatch({ sources, registry: REGISTRY, defaultSuffix: opts.suffix, log });
  if (failures.length) {
    log.error(
      `${failures.length} of ${sources.length} sources failed (${failures.map((f) => f.source).join(', ')}); ` +
        'nothing written',
    );
    process.exitCode = 1;
    return;
  }
  log.info(`${rows.length} rows from ${sources.map(sourceName).join(', ')}`);
  await writeRawGames(opts.out ?? path.join(RAW_DATA_DIR, batchOutputFile(opts.suffix)), rows, log);
});

export const scrapeCommand = new Command('scrape').description('download online playtime data');
for (const spec of PLATFORMS) scrapeCommand.addCommand(platformCommand(spec));
scrapeCommand.addCommand(batch);
