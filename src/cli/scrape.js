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

function parseSuffix(value) {
  const suffix = value.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(suffix)) {
    throw new InvalidArgumentError('must be letters, digits or dashes (it becomes part of a filename)');
  }
  return suffix;
}

/** Options every scraper shares. */
function withCommonOptions(command, { defaultOut, defaultPlatform }) {
  return command
    .option(
      '-s, --suffix <suffix>',
      'optional; appended to the credential variable name and output filename, to keep several accounts on one platform apart',
      parseSuffix,
    )
    .option('-l, --label <label>', 'platform display name written to each row', defaultPlatform)
    .option('-o, --out <file>', `output file (default: ${defaultOut})`)
    .option('-v, --verbose', 'show debug output')
    .option('-q, --quiet', 'only show warnings and errors');
}

const psn = withCommonOptions(
  new Command('psn')
    .summary('download from PlayStation Network')
    .description(
      'download playtime data from one PlayStation Network account; ' +
        'authenticates with an existing NPSSO token if available, ' +
        'otherwise walks through fetching a new one in the browser',
    ),
  { defaultOut: `data/raw/${psnOutputFile()}`, defaultPlatform: PSN_PLATFORM },
).action(async (opts) => {
  const log = createLogger(opts);
  const games = await scrapePsnAccount({ suffix: opts.suffix, platform: opts.label, log });
  await writeRawGames(opts.out ?? path.join(RAW_DATA_DIR, psnOutputFile(opts.suffix)), games, log);
});

export const scrapeCommand = new Command('scrape')
  .description('download online playtime data')
  .addCommand(psn);
