/**
 * `gameplot process` command.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../lib/log.js';
import { runProcess } from '../process/index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HELP = `Usage: gameplot process [options]

Merge scraped platform data with manual annotations and write the data file
the dashboard reads.

Options:
  --data-dir <dir>   Directory containing games-raw/ and manual/
                     (default: <repo>/data)
  --out-dir <dir>    Where to write games-processed/ and blank annotations
                     (default: same as --data-dir)
  --verbose          Show debug output
  --quiet            Only show warnings and errors
  -h, --help         Show this help`;

export async function run(argv) {
  let args;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: {
        'data-dir': { type: 'string' },
        'out-dir': { type: 'string' },
        verbose: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    console.error(`${err.message}\n\n${HELP}`);
    return 1;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const log = createLogger({ level: args.verbose ? 'debug' : args.quiet ? 'warn' : 'info' });
  const dataDir = path.resolve(args['data-dir'] ?? path.join(REPO_ROOT, 'data'));
  const outDir = path.resolve(args['out-dir'] ?? dataDir);

  const started = Date.now();
  log.info(`Processing data from ${dataDir}`);
  const result = await runProcess({ dataDir, outDir, log });
  log.info(`Done: ${result.games.length} games in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return 0;
}
