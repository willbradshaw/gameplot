/**
 * The gameplot data model.
 *
 * This module is the single description of the records that flow through the
 * pipeline and into the browser. It is plain ES module JavaScript with no
 * Node-specific imports, so the dashboard imports it directly and the
 * pipeline uses it to validate every file it reads or writes.
 *
 * Record lifecycle:
 *
 *   RawGame          one row per (game, platform) as written by a scraper
 *        │           data/games-raw/*.json
 *        ▼
 *   MergedGame       one row per game name, platforms combined
 *        │           data/games-processed/merged-platforms.json
 *        ▼  + Annotation (data/manual/annotations.json)
 *   AnnotatedGame    one row per game with rating/status/tags; what the
 *                    dashboard reads. data/games-processed/annotated-games.json
 *
 * Dates are 'YYYY-MM-DD' strings throughout, which makes "most recent" a
 * plain string comparison. Hours are decimal hours rounded to one place.
 */

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** Platforms the scrapers produce. Unknown platforms are allowed but get the fallback colour. */
export const PLATFORMS = ['Steam', 'PS5', 'Xbox', 'GOG', 'Switch'];

/** Allowed values of an annotation's `status`. */
export const STATUSES = ['Complete', 'In Progress', 'Ongoing', 'Abandoned'];

/**
 * Rating bands used by the filters and the aggregation chart. Ordered from
 * best to worst; a rating belongs to the first band whose `min` it reaches.
 */
export const RATING_BANDS = [
  { key: '9-10', min: 9 },
  { key: '8-9', min: 8 },
  { key: '7-8', min: 7 },
  { key: '6-7', min: 6 },
  { key: '5-6', min: 5 },
  { key: '<5', min: -Infinity },
];

/** @param {number|null|undefined} rating @returns {string|null} band key, or null when unrated */
export function ratingBand(rating) {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return null;
  return RATING_BANDS.find((b) => rating >= b.min).key;
}

export const PLATFORM_COLORS = {
  PS5: '#eeeeee',
  Switch: '#96ceb4',
  Xbox: '#85E34A',
  GOG: '#FC7EFF',
  Steam: '#7EBBFF',
};
export const FALLBACK_COLOR = '#999999';
export const platformColor = (platform) => PLATFORM_COLORS[platform] ?? FALLBACK_COLOR;

export const STATUS_COLORS = {
  Complete: '#10b981',
  'In Progress': '#3b82f6',
  Ongoing: '#8b5cf6',
  Abandoned: '#ef4444',
};

export const RATING_BAND_COLORS = {
  '9-10': '#3b82f6',
  '8-9': '#06b6d4',
  '7-8': '#84cc16',
  '6-7': '#eab308',
  '5-6': '#f97316',
  '<5': '#ef4444',
};

/**
 * Steam reports a last-played time of 0 for some old games, which the
 * original scraper turned into 1970-01-02. Anything before this date is
 * treated as "unknown" when loading.
 */
export const MIN_VALID_DATE = '1990-01-01';

/** Which platform's store URL to show when a game is on several. First match wins. */
export const DISPLAY_URL_PREFERENCE = ['Steam', 'PS5'];

// ---------------------------------------------------------------------------
// Schemas (see validate.js for the node types)
// ---------------------------------------------------------------------------

const str = { type: 'string', minLength: 1 };
const nullableStr = { type: 'string', nullable: true, emptyToNull: true };
const date = { type: 'date' };
const nullableDate = { type: 'date', nullable: true };
const hours = { type: 'number', min: 0 };
const id = { anyOf: [{ type: 'number', integer: true }, str] };

/**
 * @typedef {object} RawGame
 * @property {string} game        Name as reported by the platform
 * @property {string} platform    e.g. 'Steam'
 * @property {string|null} lastPlayed  YYYY-MM-DD, or null if unknown
 * @property {number|null} hoursPlayed Decimal hours; null only for GOG, whose API has no playtime
 * @property {number|string} id   Platform-specific identifier
 * @property {string|null} url    Store page, if the platform has one
 */
export const rawGameSchema = {
  type: 'object',
  required: ['game', 'platform', 'lastPlayed', 'hoursPlayed', 'id', 'url'],
  additionalProperties: false,
  properties: {
    game: str,
    platform: str,
    lastPlayed: nullableDate,
    hoursPlayed: { ...hours, nullable: true },
    id,
    url: nullableStr,
  },
};

/**
 * Manual playtime for GOG games, whose API exposes none. Only GOG games
 * listed here make it into the dashboard.
 * @typedef {{ game: string, lastPlayed: string, hoursPlayed: number }} GogAnnotation
 */
export const gogAnnotationSchema = {
  type: 'object',
  required: ['game', 'lastPlayed', 'hoursPlayed'],
  additionalProperties: false,
  properties: {
    game: str,
    lastPlayed: date,
    hoursPlayed: { ...hours, coerceFromString: true },
  },
};

/**
 * A hand-written annotation for one game.
 *
 * @typedef {object} Annotation
 * @property {string} game          Canonical name; the dashboard shows this
 * @property {number|null} rating   0-10. null means "not yet rated": the game is
 *                                  left out of the dashboard until it is
 * @property {string|null} status   One of STATUSES
 * @property {string[]} tags
 * @property {string[]} [aliases]   Other spellings the platforms use for the same
 *                                  game. All are merged into one row under `game`
 * @property {number} [hoursPlayedOverride]   Replace the scraped total. Per-platform
 *                                  hours are scaled to match
 * @property {string} [lastPlayedOverride]    Replace the scraped last-played date
 */
export const annotationSchema = {
  type: 'object',
  required: ['game', 'rating', 'status', 'tags'],
  additionalProperties: false,
  properties: {
    game: str,
    rating: { type: 'number', min: 0, max: 10, nullable: true, coerceFromString: true },
    status: { type: 'string', enum: STATUSES, nullable: true },
    tags: { type: 'array', items: str },
    aliases: { type: 'array', items: str },
    hoursPlayedOverride: { ...hours, coerceFromString: true },
    lastPlayedOverride: date,
  },
};

/**
 * One row per game, all platforms combined. The four `*Single` arrays are
 * parallel: index i of each describes the same platform.
 *
 * @typedef {object} MergedGame
 * @property {string} game
 * @property {string[]} platforms
 * @property {(number|string)[]} ids
 * @property {(string|null)[]} urls
 * @property {number[]} hoursPlayedSingle
 * @property {(string|null)[]} lastPlayedSingle
 * @property {number} hoursPlayedTotal
 * @property {string|null} lastPlayedTotal
 */
const mergedProperties = {
  game: str,
  platforms: { type: 'array', items: str },
  ids: { type: 'array', items: id },
  urls: { type: 'array', items: nullableStr },
  hoursPlayedSingle: { type: 'array', items: hours },
  lastPlayedSingle: { type: 'array', items: nullableDate },
  hoursPlayedTotal: hours,
  lastPlayedTotal: nullableDate,
};
const mergedRequired = Object.keys(mergedProperties);

export const mergedGameSchema = {
  type: 'object',
  required: mergedRequired,
  additionalProperties: false,
  properties: mergedProperties,
};

/**
 * What the dashboard reads: a MergedGame plus its annotation.
 *
 * @typedef {MergedGame & {
 *   rating: number,
 *   status: string|null,
 *   tags: string[],
 *   displayUrl: string|null,
 * }} AnnotatedGame
 */
export const annotatedGameSchema = {
  type: 'object',
  required: [...mergedRequired, 'rating', 'status', 'tags', 'displayUrl'],
  additionalProperties: false,
  properties: {
    ...mergedProperties,
    rating: { type: 'number', min: 0, max: 10 },
    status: { type: 'string', enum: STATUSES, nullable: true },
    tags: { type: 'array', items: str },
    displayUrl: nullableStr,
  },
};

/** Wrap a record schema as "array of records", which is how every data file is shaped. */
export const listOf = (itemSchema) => ({ type: 'array', items: itemSchema });
