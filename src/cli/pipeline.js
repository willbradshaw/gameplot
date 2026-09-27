/** `gameplot pipeline [sources]`. See docs/pipeline.md. */
import { Command } from 'commander';
import { createLogger } from '../lib/log.js';
import { runPipeline } from '../pipeline.js';
import { PLATFORM_NAMES, parseSources } from '../scrape/batch.js';
import { parseMonths, parseSuffix } from './options.js';

export const pipelineCommand = new Command('pipeline')
  .description('scrape, process, annotate and reprocess games')
  .argument(
    '[sources]',
    'platform[:suffix][=label], comma-separated (default: the last list used)',
    (value) => parseSources(value, PLATFORM_NAMES),
  )
  .option('-s, --suffix <suffix>', 'batch suffix; also used by sources without their own suffix', parseSuffix)
  .option('--raw-out <file>', 'raw output file (default: data/raw/batch[-suffix].json)')
  .option('-a, --annotations <file>', 'annotations file (default: data/annotations.json)')
  .option('-t, --tags <file>', 'tag vocabulary file (default: data/tags.json)')
  .option('-o, --out <file>', 'processed output file (default: data/games.json)')
  .option(
    '--annotation-months <n>',
    'months since last play; review older Active and more recent Unplayed games',
    parseMonths,
    12,
  )
  .option('-v, --verbose', 'show debug output')
  .option('-q, --quiet', 'only show warnings, errors and annotation prompts')
  .action(async (given, opts) => {
    await runPipeline({
      given,
      suffix: opts.suffix,
      rawOut: opts.rawOut,
      annotationsFile: opts.annotations,
      tagsFile: opts.tags,
      out: opts.out,
      months: opts.annotationMonths,
      log: createLogger(opts),
    });
  });
