#!/usr/bin/env node
/**
 * gameplot command-line entry point.
 *
 * Usage:
 *   gameplot <command> [options]
 *
 * Commands:
 *   scrape <platform>   Download playtime data from a platform into data/games-raw/
 *
 * Each command lives in src/cli/<command>.js and exports `run(argv)`, which
 * returns the process exit code. Adding a command means adding a file there
 * and a line to COMMANDS below.
 */

import { loadDotEnv } from '../src/lib/env.js';

const COMMANDS = {
  scrape: () => import('../src/cli/scrape.js'),
};

const USAGE = `Usage: gameplot <command> [options]

Commands:
  scrape <platform>   Download playtime data from a platform (psn)

Run "gameplot <command> --help" for command-specific options.`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const load = COMMANDS[command];
  if (!load) {
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }
  loadDotEnv();
  const mod = await load();
  return mod.run(rest);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  },
);
