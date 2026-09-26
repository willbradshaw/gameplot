/**
 * The gameplot data model.
 *
 * This module is the single description of the records that flow through the
 * pipeline and into the browser. It is plain ES module JavaScript with no
 * Node-specific imports, so the dashboard can import it directly and the
 * pipeline uses it to validate every file it reads or writes.
 *
 * Dates are 'YYYY-MM-DD' strings throughout, so "most recent" is a plain
 * string comparison. Hours are decimal hours rounded to one place.
 *
 * Only the raw (scraper output) record is defined so far; the merged and
 * annotated records are added with the `process` command.
 */

/** Platforms the scrapers produce. */
export const PLATFORMS = ['Steam', 'PS5', 'Xbox', 'GOG'];

const str = { type: 'string', minLength: 1 };

/**
 * One row per game per platform, as written by a scraper to
 * data/games-raw/<platform>.json. Every scraper produces exactly this shape.
 *
 * @typedef {object} RawGame
 * @property {string} game             Name as reported by the platform
 * @property {string} platform         One of PLATFORMS
 * @property {string|null} lastPlayed  YYYY-MM-DD, or null if the platform doesn't say
 * @property {number|null} hoursPlayed Decimal hours, or null if the platform doesn't say
 *                                     (GOG reports ownership but no playtime)
 * @property {number|string} id        Platform-specific identifier, unique within the file
 * @property {string|null} url         Store page, or null if the platform has none
 */
export const rawGameSchema = {
  type: 'object',
  required: ['game', 'platform', 'lastPlayed', 'hoursPlayed', 'id', 'url'],
  additionalProperties: false,
  properties: {
    game: str,
    platform: { type: 'string', enum: PLATFORMS },
    lastPlayed: { type: 'date', nullable: true },
    hoursPlayed: { type: 'number', min: 0, nullable: true },
    id: { anyOf: [{ type: 'number', integer: true }, str] },
    url: { type: 'string', nullable: true, emptyToNull: true },
  },
};

/** Wrap a record schema as "array of records", which is how every data file is shaped. */
export const listOf = (itemSchema) => ({ type: 'array', items: itemSchema });
