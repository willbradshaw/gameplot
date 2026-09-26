#!/usr/bin/env node
/**
 * gameplot command-line entry point.
 *
 * Usage:
 *   gameplot <command> [options]
 *
 * Commands:
 *   process   Merge scraped platform data with manual annotations and write
 *             the dashboard's data file.
 *
 * Each command lives in src/cli/<command>.js and exports `run(argv)`.
 * Adding a command means adding a file there and a line to COMMANDS below.
 */

const COMMANDS = {
  process: () => import('../src/cli/process.js'),
};

const USAGE = `Usage: gameplot <command> [options]

Commands:
  process   Merge scraped platform data with manual annotations

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
