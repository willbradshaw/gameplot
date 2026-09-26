/**
 * `gameplot process [input]`. Options only; the logic is in src/process/.
 * See docs/process.md.
 */

import { Command } from 'commander';
import { ANNOTATIONS_FILE, GAMES_FILE, RAW_BATCH_FILE, UNANNOTATED_FILE } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { runProcess } from '../process/index.js';

export const processCommand = new Command('process')
  .description('combine scraped playtime data with annotations into the file the dashboard reads')
  .argument('[input]', 'scraped data file (default: data/raw/batch.json)')
  .option('-a, --annotations <file>', 'annotations file (default: data/annotations.json)')
  .option('-o, --out <file>', 'output file (default: data/games.json)')
  .option(
    '-u, --unannotated <file>',
    'where to write fill-in entries for unannotated games (default: data/unannotated.json)',
  )
  .option('-v, --verbose', 'show debug output')
  .option('-q, --quiet', 'only show warnings and errors')
  .action(async (input, opts) => {
    const log = createLogger(opts);
    await runProcess({
      input: input ?? RAW_BATCH_FILE,
      annotationsFile: opts.annotations ?? ANNOTATIONS_FILE,
      out: opts.out ?? GAMES_FILE,
      unannotatedFile: opts.unannotated ?? UNANNOTATED_FILE,
      log,
    });
  });
