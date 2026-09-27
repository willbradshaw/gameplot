/** Scrape, process, annotate and reprocess. See docs/pipeline.md. */
import path from 'node:path';
import { runAnnotate } from './annotate/index.js';
import { ANNOTATIONS_FILE, GAMES_FILE, RAW_DATA_DIR, TAGS_FILE } from './lib/env.js';
import { runProcess } from './process/index.js';
import { batchOutputFile, runScrapeBatch } from './scrape/batch.js';

export async function runPipeline(
  {
    given,
    suffix,
    rawOut = path.join(RAW_DATA_DIR, batchOutputFile(suffix)),
    annotationsFile = ANNOTATIONS_FILE,
    tagsFile = TAGS_FILE,
    out = GAMES_FILE,
    months = 12,
    startStep = 1,
    log,
  },
  { scrape = runScrapeBatch, processGames = runProcess, annotate = runAnnotate } = {},
) {
  const paths = [rawOut, annotationsFile, tagsFile, out].map((file) => path.resolve(file));
  if (new Set(paths).size !== paths.length)
    throw new Error('raw output, annotations, tags and processed output must use different files');
  log.info('Pipeline 1/4: Scraping');
  await scrape({ given, suffix, out: rawOut, log });
  const processing = { input: rawOut, annotationsFile, tagsFile, out, log };
  log.info('Pipeline 2/4: Processing');
  await processGames(processing);
  log.info('Pipeline 3/4: Annotating');
  await annotate({ input: rawOut, annotationsFile, tagsFile, months, startStep, log });
  log.info('Pipeline 4/4: Reprocessing');
  return processGames(processing);
}
