/**
 * The gameplot data model, as zod schemas. Every file the pipeline reads or
 * writes is validated against a schema from here. See docs/scrape.md for the
 * raw record's fields.
 */

import { z } from 'zod';

const emptyToNull = (v) => (v === '' ? null : v);

/** One row per game per platform, as written by a scraper. */
export const rawGameSchema = z.strictObject({
  game: z.string().min(1),
  platform: z.string().min(1),
  lastPlayed: z.iso.date().nullable(),
  hoursPlayed: z.number().min(0).nullable(),
  id: z.union([z.int(), z.string().min(1)]),
  url: z.preprocess(emptyToNull, z.string().min(1).nullable()),
});

/** @typedef {z.infer<typeof rawGameSchema>} RawGame */

export const rawGamesSchema = z.array(rawGameSchema);

/**
 * Parse with a schema, throwing an error that names the source and lists
 * every problem with its path.
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown} value
 * @param {string} label  e.g. a file path
 * @returns {T}
 */
export function parseOrThrow(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Validation failed for ${label}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
