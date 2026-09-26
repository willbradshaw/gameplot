/**
 * `gameplot scrape <platform>`. Each platform is a subcommand; this module
 * only declares options and calls src/scrape/<platform>.js. See docs/scrape.md.
 */

import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { RAW_DATA_DIR } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { writeRawGames } from '../scrape/common.js';
import { PSN_PLATFORM, psnOutputFile, scrapePsnAccount } from '../scrape/psn.js';
import { STEAM_PLATFORM, scrapeSteamAccount, steamOutputFile } from '../scrape/steam.js';

function parseSuffix(value) {
  const suffix = value.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(suffix)) {
    throw new InvalidArgumentError('must be letters, digits or dashes (it becomes part of a filename)');
  }
  return suffix;
}

/**
 * Build a platform subcommand: the common options plus an action that scrapes
 * and writes. `scrape(opts, log)` returns the rows; `outputFile(suffix)` names
 * the default file.
 */
function platformCommand({ name, summary, description, defaultPlatform, outputFile, scrape }) {
  return new Command(name)
    .summary(summary)
    .description(description)
    .option(
      '-s, --suffix <suffix>',
      'optional; appended to the credential variable name and output filename, to keep several accounts on one platform apart',
      parseSuffix,
    )
    .option('-l, --label <label>', 'platform display name written to each row', defaultPlatform)
    .option('-o, --out <file>', `output file (default: data/raw/${outputFile()})`)
    .option('-v, --verbose', 'show debug output')
    .option('-q, --quiet', 'only show warnings and errors')
    .action(async (opts) => {
      const log = createLogger(opts);
      const games = await scrape({ suffix: opts.suffix, platform: opts.label, log });
      await writeRawGames(opts.out ?? path.join(RAW_DATA_DIR, outputFile(opts.suffix)), games, log);
    });
}

const psn = platformCommand({
  name: 'psn',
  summary: 'download from PlayStation Network',
  description:
    'download playtime data from one PlayStation Network account; ' +
    'authenticates with an existing NPSSO token if available, ' +
    'otherwise walks through fetching a new one in the browser',
  defaultPlatform: PSN_PLATFORM,
  outputFile: psnOutputFile,
  scrape: scrapePsnAccount,
});

const steam = platformCommand({
  name: 'steam',
  summary: 'download from Steam',
  description:
    'download playtime data for one Steam account via the Steam Web API; ' +
    'needs a Web API key and the 17-digit Steam ID, which are asked for ' +
    'and saved if not already present in the environment',
  defaultPlatform: STEAM_PLATFORM,
  outputFile: steamOutputFile,
  scrape: scrapeSteamAccount,
});

export const scrapeCommand = new Command('scrape')
  .description('download online playtime data')
  .addCommand(psn)
  .addCommand(steam);
