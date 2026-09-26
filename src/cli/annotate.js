/** `gameplot annotate [input]`. See docs/annotate.md. */

import { Command } from 'commander';
import { runAnnotate } from '../annotate/index.js';
import { ANNOTATIONS_FILE, RAW_BATCH_FILE, TAGS_FILE } from '../lib/env.js';
import { createLogger } from '../lib/log.js';

export const annotateCommand = new Command('annotate')
  .description('fill in missing statuses and ratings interactively')
  .argument('[input]', 'scraped data file (default: data/raw/batch.json)')
  .option('-a, --annotations <file>', 'annotations file (default: data/annotations.json)')
  .option('-t, --tags <file>', 'tag vocabulary file (default: data/tags.json)')
  .option('-v, --verbose', 'show debug output')
  .option('-q, --quiet', 'only show warnings and errors')
  .action(async (input, opts) => {
    await runAnnotate({
      input: input ?? RAW_BATCH_FILE,
      annotationsFile: opts.annotations ?? ANNOTATIONS_FILE,
      tagsFile: opts.tags ?? TAGS_FILE,
      log: createLogger(opts),
    });
  });
