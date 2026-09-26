/**
 * `gameplot scrape <platform>`: download playtime data from one platform
 * into data/games-raw/.
 *
 * Each platform is a subcommand. This module only declares options and
 * wires them to the scraper; the platform logic, including authentication,
 * lives in src/scrape/<platform>.js.
 */

import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { RAW_DATA_DIR } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { writeRawGames } from '../scrape/common.js';
import { psnOutputFile, scrapePsnAccount } from '../scrape/psn.js';

/** Options every scraper shares. */
function withCommonOptions(command, defaultOutDescription) {
  return command
    .option('-o, --out <file>', `output file (default: ${defaultOutDescription})`)
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
    .summary('PlayStation Network: the played-games list of one account')
    .description(
      'PlayStation Network: the played-games list of one account. ' +
        'Authenticates with the NPSSO token in PSN_NPSSO (environment or .env); ' +
        'if it is missing or rejected, walks you through fetching a new one in the browser.',
    )
    .option(
      '-a, --account <label>',
      'only needed with several PSN accounts: selects the token variable (PSN_NPSSO_<LABEL>) and output file',
      parseAccountLabel,
    ),
  `data/games-raw/${psnOutputFile()}`,
).action(async (opts) => {
  const log = createLogger(opts);
  const games = await scrapePsnAccount({ account: opts.account, log });
  await writeRawGames(opts.out ?? path.join(RAW_DATA_DIR, psnOutputFile(opts.account)), games, log);
});

export const scrapeCommand = new Command('scrape')
  .description('download playtime data from a platform into data/games-raw/')
  .addCommand(psn);
