/** `gameplot annotate [input]`. See docs/annotate.md. */

import { Command } from 'commander';
import { runAnnotate } from '../annotate/index.js';
import { ANNOTATIONS_FILE, RAW_BATCH_FILE, TAGS_FILE } from '../lib/env.js';
import { createLogger } from '../lib/log.js';
import { parseMonths, parseStep } from './options.js';

export const annotateCommand = new Command('annotate')
  .description('fill in missing statuses, ratings and tags interactively')
  .argument('[input]', 'scraped data file (default: data/raw/batch.json)')
  .option('-a, --annotations <file>', 'annotations file (default: data/annotations.json)')
  .option('-t, --tags <file>', 'tag vocabulary file (default: data/tags.json)')
  .option('--step <n>', 'start at this step and continue through the remaining steps', parseStep, 1)
  .option(
    '--months <n>',
    'months since last play; review older Active and more recent Unplayed games',
    parseMonths,
    12,
  )
  .option('-v, --verbose', 'show debug output')
  .option('-q, --quiet', 'hide the final save summary')
  .action(async (input, opts) => {
    await runAnnotate({
      input: input ?? RAW_BATCH_FILE,
      annotationsFile: opts.annotations ?? ANNOTATIONS_FILE,
      tagsFile: opts.tags ?? TAGS_FILE,
      log: createLogger(opts),
      months: opts.months,
      startStep: opts.step,
    });
  });
