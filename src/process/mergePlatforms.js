/**
 * Combine per-platform rows into one MergedGame per game name.
 *
 * Two raw rows belong to the same game when their `game` strings are equal.
 * (Alias handling, which lets differently-spelled names merge, happens later
 * in annotate.js and reuses `addRawToMerged` from here.)
 *
 * When a game appears twice on the *same* platform, for example a PS5 title
 * present in both the UK and US PSN accounts, the hours are summed, the later
 * date wins, and the id/url are taken from whichever row was played most
 * recently.
 */

import { laterDate, roundHours } from '../lib/hours.js';

/**
 * Start a MergedGame from a single raw row.
 * @param {import('../shared/model.js').RawGame} raw
 * @returns {import('../shared/model.js').MergedGame}
 */
export function newMerged(raw) {
  const hours = raw.hoursPlayed ?? 0;
  return {
    game: raw.game,
    platforms: [raw.platform],
    ids: [raw.id],
    urls: [raw.url],
    hoursPlayedSingle: [hours],
    lastPlayedSingle: [raw.lastPlayed],
    hoursPlayedTotal: hours,
    lastPlayedTotal: raw.lastPlayed,
  };
}

/**
 * Fold one raw row into an existing MergedGame, in place.
 * @param {import('../shared/model.js').MergedGame} merged
 * @param {import('../shared/model.js').RawGame} raw
 */
export function addRawToMerged(merged, raw) {
  const hours = raw.hoursPlayed ?? 0;
  const idx = merged.platforms.indexOf(raw.platform);
  if (idx === -1) {
    merged.platforms.push(raw.platform);
    merged.ids.push(raw.id);
    merged.urls.push(raw.url);
    merged.hoursPlayedSingle.push(hours);
    merged.lastPlayedSingle.push(raw.lastPlayed);
  } else {
    const later = laterDate(merged.lastPlayedSingle[idx], raw.lastPlayed);
    if (later !== null && later === raw.lastPlayed && later !== merged.lastPlayedSingle[idx]) {
      merged.ids[idx] = raw.id;
      merged.urls[idx] = raw.url;
    }
    merged.hoursPlayedSingle[idx] = roundHours(merged.hoursPlayedSingle[idx] + hours);
    merged.lastPlayedSingle[idx] = later;
  }
  merged.hoursPlayedTotal = roundHours(merged.hoursPlayedTotal + hours);
  merged.lastPlayedTotal = laterDate(merged.lastPlayedTotal, raw.lastPlayed);
}

/**
 * Fold every platform entry of `source` into `target`, in place. Used when
 * two MergedGames turn out to be the same game (alias resolution).
 * @param {import('../shared/model.js').MergedGame} target
 * @param {import('../shared/model.js').MergedGame} source
 */
export function mergeInto(target, source) {
  source.platforms.forEach((platform, i) => {
    addRawToMerged(target, {
      game: source.game,
      platform,
      id: source.ids[i],
      url: source.urls[i],
      hoursPlayed: source.hoursPlayedSingle[i],
      lastPlayed: source.lastPlayedSingle[i],
    });
  });
}

/**
 * Reorder the parallel per-platform arrays so the most-played platform comes
 * first. The dashboard colours each game by its first platform.
 * @param {import('../shared/model.js').MergedGame} merged
 */
export function sortPlatformsByHours(merged) {
  const order = merged.platforms
    .map((_, i) => i)
    .sort((a, b) => merged.hoursPlayedSingle[b] - merged.hoursPlayedSingle[a] || a - b);
  for (const key of ['platforms', 'ids', 'urls', 'hoursPlayedSingle', 'lastPlayedSingle']) {
    merged[key] = order.map((i) => merged[key][i]);
  }
}

/**
 * Merge raw rows from all platforms.
 * @param {import('../shared/model.js').RawGame[]} rawGames
 * @returns {Map<string, import('../shared/model.js').MergedGame>} keyed by game name
 */
export function mergePlatforms(rawGames) {
  const merged = new Map();
  for (const raw of rawGames) {
    const existing = merged.get(raw.game);
    if (existing) addRawToMerged(existing, raw);
    else merged.set(raw.game, newMerged(raw));
  }
  for (const game of merged.values()) sortPlatformsByHours(game);
  return merged;
}
