/**
 * Xbox scraper, via the OpenXBL API (https://xbl.io). See docs/scrape.md.
 * Network access goes through an injectable `fetchImpl` so request handling
 * and conversion are testable without a key.
 */

import { saveEnvVar } from '../lib/env.js';
import { askSecret } from '../lib/prompt.js';
import {
  combineDuplicateIds,
  finalizeRawGames,
  isoToDate,
  roundHours,
  suffixedEnvVar,
  suffixedFile,
} from './common.js';

export const XBOX_PLATFORM = 'Xbox';
const BASE_URL = 'https://xbl.io/api/v2';
const API_KEY_URL = 'https://xbl.io/';

/** Thrown when OpenXBL rejects the API key, so callers can re-prompt rather than abort. */
export class XboxAuthError extends Error {}

/**
 * Thrown when OpenXBL's shared rate-limit window (60 requests per 5 minutes
 * across all its users) is exhausted. Recovery takes minutes, so the scrape
 * fails immediately rather than waiting.
 */
export class XboxRateLimitError extends Error {}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const isEnvelope = (body) => body !== null && typeof body === 'object' && 'content' in body && 'code' in body;
const isRateLimited = (body) => body !== null && typeof body === 'object' && body.limitType === 'Rate';

function rateLimitError(notice) {
  const detail =
    notice && typeof notice === 'object' && notice.maxRequests
      ? ` (${notice.currentRequests}/${notice.maxRequests} requests in the last ${notice.periodInSeconds}s)`
      : '';
  return new XboxRateLimitError(
    `OpenXBL's shared rate limit is exhausted${detail}; try again in a few minutes`,
  );
}

/**
 * One authenticated OpenXBL call, with envelope unwrapping. The rate-limit
 * notice can arrive as HTTP 429, as an envelope with code 429, or as the bare
 * body; all fail immediately. Note the explicit Accept-Language: Node's
 * fetch sends `*` by default, which OpenXBL rejects as an invalid locale.
 *
 * @param {object} ctx
 * @param {string} ctx.apiKey
 * @param {typeof fetch} [ctx.fetchImpl]
 * @param {string} path  e.g. '/account'
 * @param {{ method?: 'GET'|'POST', body?: object }} [init]
 * @returns {Promise<any>} the unwrapped response body
 */
export async function openXblRequest({ apiKey, fetchImpl = fetch }, path, init = {}) {
  const headers = {
    'X-Authorization': apiKey,
    Accept: 'application/json',
    'Accept-Language': 'en-US',
  };
  const request = { method: init.method ?? 'GET', headers };
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(init.body);
  }

  const res = await fetchImpl(`${BASE_URL}${path}`, request);
  if (res.status === 401 || res.status === 403)
    throw new XboxAuthError(`OpenXBL rejected the API key (HTTP ${res.status})`);
  if (res.status !== 200 && res.status !== 429)
    throw new Error(`OpenXBL request failed (HTTP ${res.status}) for ${path}`);

  let body = await res.json();
  if (isEnvelope(body)) {
    if (body.code === 401 || body.code === 403)
      throw new XboxAuthError(`OpenXBL rejected the API key (code ${body.code})`);
    if (body.code === 429 || isRateLimited(body.content)) throw rateLimitError(body.content);
    if (body.code !== 200)
      throw new Error(`OpenXBL error ${body.code} for ${path}: ${JSON.stringify(body.content)}`);
    body = body.content;
  }
  if (res.status === 429 || isRateLimited(body)) throw rateLimitError(body);
  return body;
}

/** @returns {Promise<{ xuid: string, gamertag: string }>} */
export async function fetchAccount(ctx) {
  const account = await openXblRequest(ctx, '/account');
  const profile = account?.profileUsers?.[0];
  if (!profile?.id) throw new Error(`Unexpected /account response: ${JSON.stringify(account).slice(0, 200)}`);
  const gamertag = profile.settings?.find((s) => s.id === 'Gamertag')?.value ?? '(unknown gamertag)';
  return { xuid: profile.id, gamertag };
}

/** @returns {Promise<object[]>} title records, played or not */
export async function fetchTitleHistory(ctx, xuid) {
  const history = await openXblRequest(ctx, `/player/titleHistory/${xuid}`);
  if (!Array.isArray(history?.titles)) throw new Error('OpenXBL returned no title history');
  return history.titles;
}

/**
 * Minutes played per title, from the stats endpoint, in one batched request.
 * @returns {Promise<Map<string, number>>} titleId -> minutes
 */
export async function fetchMinutesPlayed(ctx, xuid, titleIds) {
  if (titleIds.length === 0) return new Map();
  const body = { xuids: [xuid], stats: titleIds.map((titleId) => ({ name: 'MinutesPlayed', titleId })) };
  const result = await openXblRequest(ctx, '/player/stats', { method: 'POST', body });
  const stats = result?.statlistscollection?.[0]?.stats;
  if (!Array.isArray(stats)) throw new Error('OpenXBL returned no stats data');
  const minutes = new Map();
  for (const stat of stats) {
    if (stat.name !== 'MinutesPlayed' || !stat.titleid) continue;
    const value = Number(stat.value ?? 0);
    if (!Number.isFinite(value))
      throw new Error(`Invalid MinutesPlayed value for title ${stat.titleid}: ${stat.value}`);
    minutes.set(String(stat.titleid), value);
  }
  return minutes;
}

// ---------------------------------------------------------------------------
// Conversion (pure)
// ---------------------------------------------------------------------------

/**
 * Convert title-history records plus their playtime into RawGame rows.
 * Titles never played (no lastTimePlayed) or with no recorded minutes are
 * skipped; titles missing from the stats response are reported.
 *
 * @param {object[]} titles
 * @param {Map<string, number>} minutesByTitle
 * @param {import('consola').ConsolaInstance} log
 * @param {string} [platform]
 * @returns {import('../shared/model.js').RawGame[]}
 */
export function convertXboxTitles(titles, minutesByTitle, log, platform = XBOX_PLATFORM) {
  const rows = [];
  for (const t of titles) {
    const lastTimePlayed = t.titleHistory?.lastTimePlayed;
    if (!lastTimePlayed) continue;
    const id = String(t.titleId);
    if (!minutesByTitle.has(id)) log.warn(`"${t.name}": no playtime stats returned; recording 0 hours`);
    const minutes = minutesByTitle.get(id) ?? 0;
    if (minutes <= 0) {
      log.debug(`"${t.name}": played but no recorded minutes; skipping`);
      continue;
    }
    rows.push({
      game: t.name || `Unknown Game (${id})`,
      platform,
      lastPlayed: isoToDate(lastTimePlayed),
      hoursPlayed: roundHours(minutes / 60),
      id,
      url: null,
    });
  }
  return finalizeRawGames(combineDuplicateIds(rows, log), 'Xbox titles');
}

/**
 * Scrape one Xbox account.
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} [options.platform]
 * @param {import('consola').ConsolaInstance} options.log
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function scrapeXbox({ apiKey, platform = XBOX_PLATFORM, log, fetchImpl }) {
  const ctx = { apiKey, fetchImpl, log };
  log.start('Looking up the account behind the OpenXBL key');
  const { xuid, gamertag } = await fetchAccount(ctx);
  log.info(`Account: ${gamertag}`);
  const titles = await fetchTitleHistory(ctx, xuid);
  const played = titles.filter((t) => t.titleHistory?.lastTimePlayed);
  log.info(`Xbox reports ${titles.length} titles, ${played.length} played`);
  const minutes = await fetchMinutesPlayed(
    ctx,
    xuid,
    played.map((t) => String(t.titleId)),
  );
  const rows = convertXboxTitles(played, minutes, log, platform);
  log.info(`${rows.length} titles have playtime`);
  return rows;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export const xboxEnvVar = (suffix) => suffixedEnvVar('OPENXBL_API_KEY', suffix);
export const xboxOutputFile = (suffix) => suffixedFile('xbox', suffix);

const looksLikeKey = (value) =>
  typeof value === 'string' && value.trim().length >= 16 && !/\s/.test(value.trim());

export async function promptForXboxKey(log) {
  log.info(`An OpenXBL API key can be created after signing in with the Xbox account at ${API_KEY_URL}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const value = await askSecret('OpenXBL API key');
    if (looksLikeKey(value)) return value.trim();
    log.warn("That doesn't look like an API key. Try again.");
  }
  throw new Error('No valid API key provided');
}

export async function saveXboxKey(envVar, apiKey, log) {
  await saveEnvVar(envVar, apiKey);
  log.success(`Saved ${envVar} to .env`);
}

/**
 * Scrape one Xbox account, resolving the API key first: from the environment
 * when present and accepted, otherwise by prompting, then saving.
 */
export async function scrapeXboxAccount({
  suffix,
  platform = XBOX_PLATFORM,
  log,
  env = process.env,
  prompt = promptForXboxKey,
  save = saveXboxKey,
  fetchImpl,
}) {
  const envVar = xboxEnvVar(suffix);
  const fromEnv = env[envVar];
  if (fromEnv && !looksLikeKey(fromEnv))
    log.warn(`${envVar} is set but does not look like an API key; ignoring it`);

  if (looksLikeKey(fromEnv)) {
    try {
      return await scrapeXbox({ apiKey: fromEnv.trim(), platform, log, fetchImpl });
    } catch (err) {
      if (!(err instanceof XboxAuthError)) throw err;
      log.warn(`${err.message}; asking for the key again`);
    }
  }
  const apiKey = await prompt(log);
  const games = await scrapeXbox({ apiKey, platform, log, fetchImpl });
  await save(envVar, apiKey, log);
  return games;
}
