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
    log,
  },
  { scrape = runScrapeBatch, processGames = runProcess, annotate = runAnnotate } = {},
) {
  const paths = [rawOut, annotationsFile, tagsFile, out].map((file) => path.resolve(file));
  if (new Set(paths).size !== paths.length)
    throw new Error('raw output, annotations, tags and processed output must use different files');
  log.box('Stage A: Scrape');
  await scrape({ given, suffix, out: rawOut, log });
  const processing = { input: rawOut, annotationsFile, tagsFile, out, log };
  log.box('Stage B: Process');
  await processGames(processing);
  log.box('Stage C: Annotate');
  await annotate({ input: rawOut, annotationsFile, tagsFile, months, log });
  log.box('Stage D: Reprocess');
  return processGames(processing);
}
