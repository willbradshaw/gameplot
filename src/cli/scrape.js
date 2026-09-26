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

/** Options every scraper shares. */
function withCommonOptions(command, { defaultOut, defaultPlatform }) {
  return command
    .option('-l, --label <label>', 'platform display name written to each row', defaultPlatform)
    .option('-o, --out <file>', `output file (default: ${defaultOut})`)
    .option('-v, --verbose', 'show debug output')
    .option('-q, --quiet', 'only show warnings and errors');
}

function parseAccountLabel(value) {
  const label = value.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new InvalidArgumentError('must be letters, digits or dashes (it becomes part of a filename)');
  }
  return label;
}

const psn = withCommonOptions(
  new Command('psn')
    .summary('download from PlayStation Network')
    .description(
      'download playtime data from one PlayStation Network account; ' +
        'authenticates with an existing NPSSO token if available, ' +
        'otherwise walks through fetching a new one in the browser',
    )
    .option(
      '-a, --account <account>',
      'optional; distinguishes PSN accounts in the NPSSO token variable and output file path',
      parseAccountLabel,
    ),
  { defaultOut: `data/games-raw/${psnOutputFile()}`, defaultPlatform: PSN_PLATFORM },
).action(async (opts) => {
  const log = createLogger(opts);
  const games = await scrapePsnAccount({ account: opts.account, platform: opts.label, log });
  await writeRawGames(opts.out ?? path.join(RAW_DATA_DIR, psnOutputFile(opts.account)), games, log);
});

export const scrapeCommand = new Command('scrape')
  .description('download online playtime data')
  .addCommand(psn);
