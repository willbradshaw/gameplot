/**
 * The gameplot data model, as zod schemas. Every file the pipeline reads or
 * writes is validated against a schema from here. See docs/scrape.md for the
 * raw record and docs/process.md for annotations and the output.
 */

import { z } from 'zod';

const emptyToNull = (v) => (v === '' ? null : v);
const name = z.string().min(1);
const isoDate = z.iso.date();
const hours = z.number().min(0);
const id = z.union([z.int(), z.string().min(1)]);

/** Allowed values of an annotation's `status`. */
export const STATUSES = ['Complete', 'Active', 'Abandoned'];

/** One row per game per platform, as written by a scraper. */
export const rawGameSchema = z.strictObject({
  game: name,
  platform: name,
  lastPlayed: isoDate.nullable(),
  hoursPlayed: hours.nullable(),
  id,
  url: z.preprocess(emptyToNull, z.string().min(1).nullable()),
});

/** @typedef {z.infer<typeof rawGameSchema>} RawGame */

export const rawGamesSchema = z.array(rawGameSchema);

/** A per-platform playtime correction inside an annotation. */
export const playtimeCorrectionSchema = z.strictObject({
  hoursPlayed: hours.optional(),
  lastPlayed: isoDate.optional(),
});

/** One hand-written annotation in data/annotations.json. */
export const annotationSchema = z
  .strictObject({
    game: name,
    rating: z.number().min(0).max(10).nullable(),
    status: z.enum(STATUSES).nullable(),
    tags: z.array(name),
    aliases: z.array(name).optional(),
    playtime: z.record(name, playtimeCorrectionSchema).optional(),
  })
  .refine((a) => a.rating === null || a.status !== null, {
    message: 'a rated game must have a status',
    path: ['status'],
  });

/** @typedef {z.infer<typeof annotationSchema>} Annotation */

export const annotationsSchema = z.array(annotationSchema);

/** data/tags.json: the tag vocabulary, each tag with a one-line description. */
export const tagsSchema = z.record(name, z.string().min(1));

/** One entry in data/games.json: a game across its platforms plus its annotation. */
export const gameSchema = z.strictObject({
  game: name,
  platforms: z.array(name),
  ids: z.array(id),
  urls: z.array(z.string().min(1).nullable()),
  hoursPlayedSingle: z.array(hours),
  lastPlayedSingle: z.array(isoDate.nullable()),
  hoursPlayedTotal: hours,
  lastPlayedTotal: isoDate,
  displayUrl: z.string().min(1).nullable(),
  rating: z.number().min(0).max(10),
  status: z.enum(STATUSES),
  tags: z.array(name),
});

/** @typedef {z.infer<typeof gameSchema>} Game */

export const gamesSchema = z.array(gameSchema);

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
