#!/usr/bin/env node
/**
 * gameplot command-line entry point.
 *
 * Commands are built with commander and live in src/cli/. Each module there
 * exports a Command; register it below and it appears in `gameplot --help`.
 */

import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { annotateCommand } from '../src/cli/annotate.js';
import { processCommand } from '../src/cli/process.js';
import { scrapeCommand } from '../src/cli/scrape.js';
import { loadDotEnv } from '../src/lib/env.js';

const program = new Command('gameplot')
  .description('personal video-game dashboard: scrape playtime, merge it with your ratings, render a page')
  .version(pkg.version)
  .showHelpAfterError()
  .hook('preAction', () => {
    loadDotEnv();
  });

program.addCommand(scrapeCommand);
program.addCommand(processCommand);
program.addCommand(annotateCommand);

try {
  await program.parseAsync(process.argv);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
