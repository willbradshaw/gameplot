/**
 * `gameplot scrape <platform>` command.
 *
 * Each platform has its own option set and handler below. Output goes to
 * data/games-raw/ by default so the process stage picks it up.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { RAW_DATA_DIR } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { writeRawGames } from '../scrape/common.js';
import { cleanNpsso, npssoEnvVar, promptForNpsso, psnOutputFile, scrapePsn } from '../scrape/psn.js';

const USAGE = `Usage: gameplot scrape <platform> [options]

Platforms:
  psn   PlayStation Network (one account per run)

Run "gameplot scrape <platform> --help" for options.`;

const COMMON_OPTIONS = {
  out: { type: 'string' },
  verbose: { type: 'boolean', default: false },
  quiet: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

const PLATFORMS = {
  psn: {
    help: `Usage: gameplot scrape psn [options]

Download the played-games list of a PlayStation Network account.

Options:
  --account <label>  Only needed if you have several PSN accounts. Selects the
                     token variable (${npssoEnvVar('<LABEL>')}) and output file
                     (psn-games-<label>.json) so each account gets its own
  --out <file>       Output file (default: data/games-raw/${psnOutputFile()})
  --verbose          Show debug output
  --quiet            Only show warnings and errors
  -h, --help         Show this help

Authentication: the NPSSO token is read from ${npssoEnvVar()} in the environment
(or .env). If it is missing or PSN rejects it, you are walked through fetching
a new one in the browser.`,
    options: { account: { type: 'string' } },
    async run(args, log) {
      const account = args.account?.toLowerCase() || undefined;
      if (account !== undefined && !/^[a-z0-9-]+$/.test(account)) {
        throw new UsageError('--account must be letters, digits or dashes (it becomes part of a filename)');
      }
      const out = args.out ?? path.join(RAW_DATA_DIR, psnOutputFile(account));

      const envVar = npssoEnvVar(account);
      let npsso = cleanNpsso(process.env[envVar]);
      if (process.env[envVar] && !npsso) log.warn(`${envVar} is set but is not a valid NPSSO token; ignoring it`);

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
    },
  },
};

class UsageError extends Error {}

export async function run(argv) {
  const [platform, ...rest] = argv;
  if (!platform || platform === '--help' || platform === '-h') {
    console.log(USAGE);
    return platform ? 0 : 1;
  }
  const spec = PLATFORMS[platform];
  if (!spec) {
    console.error(`Unknown platform: ${platform}\n\n${USAGE}`);
    return 1;
  }

  let args;
  try {
    ({ values: args } = parseArgs({ args: rest, options: { ...COMMON_OPTIONS, ...spec.options }, strict: true }));
  } catch (err) {
    console.error(`${err.message}\n\n${spec.help}`);
    return 1;
  }
  if (args.help) {
    console.log(spec.help);
    return 0;
  }

  const log = createLogger({ level: args.verbose ? 'debug' : args.quiet ? 'warn' : 'info' });
  const started = Date.now();
  try {
    await spec.run(args, log);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n\n${spec.help}`);
      return 1;
    }
    throw err;
  }
  log.info(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return 0;
}
