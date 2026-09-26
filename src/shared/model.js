/**
 * The gameplot data model, as zod schemas.
 *
 * Every file the pipeline reads or writes is validated against a schema
 * from this module. Dates are 'YYYY-MM-DD' strings throughout, so "most
 * recent" is a plain string comparison. Hours are decimal hours rounded to
 * one place.
 *
 * Only the raw (scraper output) record is defined so far; the merged and
 * annotated records are added with the `process` command.
 */

import { z } from 'zod';
import { PLATFORMS } from './constants.js';

const emptyToNull = (v) => (v === '' ? null : v);

/**
 * One row per game per platform, as written by a scraper to
 * data/games-raw/<platform>.json. Every scraper produces exactly this shape.
 *
 * - `lastPlayed` and `hoursPlayed` are null when the platform doesn't say
 *   (GOG reports ownership but no playtime).
 * - `id` is the platform's own identifier and must be unique within a file.
 * - `url` is the store page, or null if the platform has none.
 */
export const rawGameSchema = z.strictObject({
  game: z.string().min(1),
  platform: z.enum(PLATFORMS),
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
