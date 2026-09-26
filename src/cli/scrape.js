/**
 * `gameplot scrape <platform>`: download playtime data from one platform
 * into data/games-raw/.
 *
 * Each platform is a subcommand with its own options. Output filenames are
 * per platform (and per account, where a platform supports several), and
 * the process stage reads every file in the directory, so nothing here is
 * hard-wired to a particular user's setup.
 */

import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { RAW_DATA_DIR } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { writeRawGames } from '../scrape/common.js';
import { cleanNpsso, npssoEnvVar, promptForNpsso, psnOutputFile, scrapePsn } from '../scrape/psn.js';

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

// ---------------------------------------------------------------------------
// psn
// ---------------------------------------------------------------------------

const psn = withCommonOptions(
  new Command('psn')
    .description('PlayStation Network: the played-games list of one account')
    .option(
      '-a, --account <label>',
      'only needed with several PSN accounts: selects the token variable (PSN_NPSSO_<LABEL>) and output file',
      parseAccountLabel,
    ),
  `data/games-raw/${psnOutputFile()}`,
)
  .addHelpText(
    'after',
    `
Authentication: the NPSSO token is read from PSN_NPSSO in the environment (or
.env). If it is missing or PSN rejects it, you are walked through fetching a
new one in the browser.`,
  )
  .action(async (opts) => {
    const log = createLogger(opts);
    const account = opts.account;
    const out = opts.out ?? path.join(RAW_DATA_DIR, psnOutputFile(account));

    const envVar = npssoEnvVar(account);
    let npsso = cleanNpsso(process.env[envVar]);
    if (process.env[envVar] && !npsso)
      log.warn(`${envVar} is set but is not a valid NPSSO token; ignoring it`);

    let games;
    if (npsso) {
      try {
        games = await scrapePsn({ npsso, log });
      } catch (err) {
        log.warn(`Token from ${envVar} was rejected (${err.message}); falling back to browser login`);
      }
    }
    if (!games) {
      npsso = await promptForNpsso(account, log);
      games = await scrapePsn({ npsso, log });
    }
    await writeRawGames(out, games, log);
  });

// ---------------------------------------------------------------------------

export const scrapeCommand = new Command('scrape')
  .description('download playtime data from a platform into data/games-raw/')
  .addCommand(psn);
