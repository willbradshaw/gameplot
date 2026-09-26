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
  .argument('[input]', 'scraped data file', RAW_BATCH_FILE)
  .option('-a, --annotations <file>', 'annotations file', ANNOTATIONS_FILE)
  .option('-o, --out <file>', 'output file', GAMES_FILE)
  .option(
    '-u, --unannotated <file>',
    'where to write fill-in entries for unannotated games',
    UNANNOTATED_FILE,
  )
  .option('-v, --verbose', 'show debug output')
  .option('-q, --quiet', 'only show warnings and errors')
  .action(async (input, opts) => {
    const log = createLogger(opts);
    await runProcess({
      input,
      annotationsFile: opts.annotations,
      out: opts.out,
      unannotatedFile: opts.unannotated,
      log,
    });
  });
