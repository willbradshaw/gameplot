/**
 * Steam scraper. See docs/scrape.md for the credentials and output. Network
 * access goes through an injectable `fetchImpl` so conversion and credential
 * handling are testable without a key.
 */

import { saveEnvVar } from '../lib/env.js';
import { ask, askSecret } from '../lib/prompt.js';
import {
  combineDuplicateIds,
  finalizeRawGames,
  isoToDate,
  roundHours,
  suffixedEnvVar,
  suffixedFile,
} from './common.js';

export const STEAM_PLATFORM = 'Steam';
const OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';
const API_KEY_URL = 'https://steamcommunity.com/dev/apikey';
const STEAM_ID_URL = 'https://store.steampowered.com/account/';
const API_KEY_RE = /^[0-9A-Fa-f]{32}$/;
const STEAM_ID_RE = /^\d{17}$/;

/**
 * Steam reports a placeholder last-played time of 86400 (1970-01-02) for some
 * old titles. Anything before Steam existed is treated as unknown.
 */
const MIN_PLAUSIBLE_DATE = '2003-09-12';

/** Thrown when Steam rejects the API key, so callers can re-prompt rather than abort. */
export class SteamAuthError extends Error {}

// ---------------------------------------------------------------------------
// Conversion (pure)
// ---------------------------------------------------------------------------

function lastPlayedDate(game, log) {
  if (!game.rtime_last_played) return null;
  const date = isoToDate(new Date(game.rtime_last_played * 1000).toISOString());
  if (date < MIN_PLAUSIBLE_DATE) {
    log.debug(`"${game.name}": Steam reports last played ${date}, a placeholder; treating as unknown`);
    return null;
  }
  return date;
}

/**
 * Convert GetOwnedGames records into RawGame rows. Playtime is the sum of
 * online and offline minutes; games with none are skipped.
 * @param {object[]} games  the `response.games` array from GetOwnedGames
 * @param {import('consola').ConsolaInstance} log
 * @param {string} [platform]  display name written to each row
 * @returns {import('../shared/model.js').RawGame[]}
 */
export function convertSteamGames(games, log, platform = STEAM_PLATFORM) {
  const rows = [];
  for (const g of games) {
    const minutes = (g.playtime_forever ?? 0) + (g.playtime_disconnected ?? 0);
    if (minutes <= 0) continue;
    rows.push({
      game: g.name || `Unknown Game (${g.appid})`,
      platform,
      lastPlayed: lastPlayedDate(g, log),
      hoursPlayed: roundHours(minutes / 60),
      id: g.appid,
      url: `https://store.steampowered.com/app/${g.appid}`,
    });
  }
  return finalizeRawGames(combineDuplicateIds(rows, log), 'Steam games');
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * Fetch the owned-games list, including free games that have been played.
 * @param {{ apiKey: string, steamId: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<object[]>}
 */
export async function fetchOwnedGames({ apiKey, steamId, fetchImpl = fetch }) {
  const url = new URL(OWNED_GAMES_URL);
  url.search = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    format: 'json',
    include_appinfo: '1',
    include_played_free_games: '1',
  }).toString();

  const res = await fetchImpl(url);
  if (res.status === 401 || res.status === 403)
    throw new SteamAuthError(`Steam rejected the API key (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`Steam API request failed (HTTP ${res.status})`);
  const body = await res.json();
  const games = body?.response?.games;
  if (!Array.isArray(games)) {
    throw new Error(
      "Steam returned no games: the Steam ID may be wrong, or the profile's game details may be private",
    );
  }
  return games;
}

/**
 * Scrape one Steam account.
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.steamId  64-bit Steam ID
 * @param {string} [options.platform]  display name written to each row
 * @param {import('consola').ConsolaInstance} options.log
 * @param {typeof fetch} [options.fetchImpl]  injectable for tests
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapeSteam({ apiKey, steamId, platform = STEAM_PLATFORM, log, fetchImpl }) {
  log.start('Fetching owned games from the Steam Web API');
  const games = await fetchOwnedGames({ apiKey, steamId, fetchImpl });
  log.info(`Steam reports ${games.length} owned games`);
  const rows = convertSteamGames(games, log, platform);
  log.info(`${rows.length} games have playtime`);
  return rows;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/** Environment variables holding the credentials, with the --suffix applied. */
export const steamEnvVars = (suffix) => ({
  apiKey: suffixedEnvVar('STEAM_API_KEY', suffix),
  steamId: suffixedEnvVar('STEAM_ID', suffix),
});

/** Default output filename, with the --suffix applied. */
export const steamOutputFile = (suffix) => suffixedFile('steam', suffix);

export const isApiKey = (value) => API_KEY_RE.test((value ?? '').trim());
export const isSteamId = (value) => STEAM_ID_RE.test((value ?? '').trim());

/**
 * Read both credentials from the environment, if present and well-formed.
 * @returns {{ apiKey: string, steamId: string } | null}
 */
export function credentialsFromEnv(env, vars, log) {
  const apiKey = env[vars.apiKey];
  const steamId = env[vars.steamId];
  if (!apiKey && !steamId) return null;
  if (!isApiKey(apiKey)) {
    log.warn(
      `${vars.apiKey} is ${apiKey ? 'not a valid Steam Web API key' : 'not set'}; ignoring stored credentials`,
    );
    return null;
  }
  if (!isSteamId(steamId)) {
    log.warn(
      `${vars.steamId} is ${steamId ? 'not a 17-digit Steam ID' : 'not set'}; ignoring stored credentials`,
    );
    return null;
  }
  return { apiKey: apiKey.trim(), steamId: steamId.trim() };
}

/**
 * Ask for the API key and Steam ID on the terminal.
 * @param {import('consola').ConsolaInstance} log
 * @returns {Promise<{ apiKey: string, steamId: string }>}
 */
export async function promptForSteamCredentials(log) {
  log.info(`A Steam Web API key can be created at ${API_KEY_URL}`);
  const apiKey = await askUntil(
    () => askSecret('Steam Web API key'),
    isApiKey,
    'expected 32 hex characters',
    log,
  );
  log.info(`The 17-digit Steam ID is shown at the top of ${STEAM_ID_URL}`);
  const steamId = await askUntil(() => ask('64-bit Steam ID'), isSteamId, 'expected 17 digits', log);
  return { apiKey: apiKey.trim(), steamId: steamId.trim() };
}

async function askUntil(askOnce, isValid, hint, log) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const value = await askOnce();
    if (isValid(value)) return value;
    log.warn(`That doesn't look right (${hint}). Try again.`);
  }
  throw new Error('No valid value provided');
}

/**
 * Store credentials that have just worked in .env.
 * @param {{ apiKey: string, steamId: string }} vars  variable names
 * @param {{ apiKey: string, steamId: string }} creds
 * @param {import('consola').ConsolaInstance} log
 */
export async function saveSteamCredentials(vars, creds, log) {
  await saveEnvVar(vars.apiKey, creds.apiKey);
  await saveEnvVar(vars.steamId, creds.steamId);
  log.success(`Saved ${vars.apiKey} and ${vars.steamId} to .env`);
}

/**
 * Scrape one Steam account, resolving credentials first: from the environment
 * when present and accepted by Steam, otherwise by prompting, after which they
 * are saved for next time. Network failures other than a rejected key are
 * not treated as a credential problem and propagate.
 *
 * @param {object} options
 * @param {string} [options.suffix]  the --suffix option; selects the variables
 * @param {string} [options.platform]  display name written to each row
 * @param {import('consola').ConsolaInstance} options.log
 * @param {NodeJS.ProcessEnv} [options.env]  injectable for tests
 * @param {typeof promptForSteamCredentials} [options.prompt]  injectable for tests
 * @param {typeof saveSteamCredentials} [options.save]  injectable for tests
 * @param {typeof fetch} [options.fetchImpl]  injectable for tests
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapeSteamAccount({
  suffix,
  platform = STEAM_PLATFORM,
  log,
  env = process.env,
  prompt = promptForSteamCredentials,
  save = saveSteamCredentials,
  fetchImpl,
}) {
  const vars = steamEnvVars(suffix);
  const fromEnv = credentialsFromEnv(env, vars, log);
  if (fromEnv) {
    try {
      return await scrapeSteam({ ...fromEnv, platform, log, fetchImpl });
    } catch (err) {
      if (!(err instanceof SteamAuthError)) throw err;
      log.warn(`${err.message}; asking for credentials again`);
    }
  }
  const creds = await prompt(log);
  const games = await scrapeSteam({ ...creds, platform, log, fetchImpl });
  await save(vars, creds, log);
  return games;
}
