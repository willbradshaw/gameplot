/**
 * PlayStation Network scraper. See docs/scrape.md for how authentication,
 * accounts and the output work. Network access goes through an injectable
 * `api` object so conversion and pagination are testable without credentials.
 */

import * as psnApi from 'psn-api';
import { ENV_FILE, saveEnvVar } from '../lib/env.js';
import { askSecret, openInBrowser, pause } from '../lib/prompt.js';
import {
  combineDuplicateIds,
  finalizeRawGames,
  isoToDate,
  roundHours,
  suffixedEnvVar,
  suffixedFile,
} from './common.js';

export const PSN_PLATFORM = 'PS5';
const PAGE_SIZE = 200;
const NPSSO_LENGTH = 64;
const LOGIN_URL = 'https://www.playstation.com/';
const NPSSO_URL = 'https://ca.account.sony.com/api/v1/ssocookie';

// ---------------------------------------------------------------------------
// Conversion (pure)
// ---------------------------------------------------------------------------

const DURATION_RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * Parse an ISO 8601 duration such as "PT228H56M33S" into decimal hours.
 * @param {string} duration
 * @returns {number}
 */
export function parsePlayDuration(duration) {
  const m = DURATION_RE.exec(duration ?? '');
  if (!m) throw new Error(`Unparseable play duration: ${JSON.stringify(duration)}`);
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = m.map((x) => (x === undefined ? 0 : Number(x)));
  return roundHours(days * 24 + hours + minutes / 60 + seconds / 3600);
}

/**
 * Convert psn-api title records into RawGame rows.
 *
 * - Titles with no recorded playtime are dropped.
 * - The concept id (shared by all editions of a game) is preferred as the
 *   id, falling back to the title id. Rows sharing an id are combined.
 * - The store URL is built from the concept id when there is one.
 *
 * @param {import('psn-api').UserPlayedGamesResponse['titles']} titles
 * @param {import('consola').ConsolaInstance} log
 * @param {string} [platform]  display name written to each row
 * @returns {import('../shared/model.js').RawGame[]}
 */
export function convertPsnTitles(titles, log, platform = PSN_PLATFORM) {
  const rows = [];
  for (const t of titles) {
    if (!t.playDuration || t.playDuration === 'PT0S') continue;
    const id = t.concept?.id ?? t.titleId;
    rows.push({
      game: t.localizedName || t.name || `Unknown Game (${id})`,
      platform,
      lastPlayed: isoToDate(t.lastPlayedDateTime),
      hoursPlayed: parsePlayDuration(t.playDuration),
      id,
      url: t.concept?.id ? `https://store.playstation.com/concept/${t.concept.id}` : null,
    });
  }
  return finalizeRawGames(combineDuplicateIds(rows, log), 'PSN titles');
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * Fetch every page of an account's played games.
 * @param {typeof psnApi} api
 * @param {import('psn-api').AuthorizationPayload} authorization
 * @param {string} accountId
 * @param {import('consola').ConsolaInstance} log
 */
export async function fetchAllPlayedGames(api, authorization, accountId, log) {
  const titles = [];
  let offset = 0;
  for (;;) {
    const page = await api.getUserPlayedGames(authorization, accountId, { limit: PAGE_SIZE, offset });
    if (!page?.titles) throw new Error('PSN returned no titles; the account may be private');
    titles.push(...page.titles);
    log.debug(`Fetched ${titles.length}/${page.totalItemCount} titles`);
    if (page.titles.length === 0 || titles.length >= page.totalItemCount) break;
    offset = page.nextOffset ?? titles.length;
  }
  return titles;
}

/**
 * Exchange an NPSSO token for API authorization.
 * @param {typeof psnApi} api
 * @param {string} npsso
 */
export async function authenticate(api, npsso) {
  const accessCode = await api.exchangeNpssoForAccessCode(npsso);
  return api.exchangeAccessCodeForAuthTokens(accessCode);
}

/**
 * Exchange a refresh token from an earlier login for fresh API authorization.
 * @param {typeof psnApi} api
 * @param {string} refreshToken
 */
export const authorizeWithRefreshToken = (api, refreshToken) =>
  api.exchangeRefreshTokenForAuthTokens(refreshToken);

/**
 * Fetch and convert the played-games list given API authorization.
 * @param {object} options
 * @param {import('psn-api').AuthorizationPayload} options.authorization
 * @param {string} [options.accountId]  "me" for the authenticating account
 * @param {string} [options.platform]  display name written to each row
 * @param {import('consola').ConsolaInstance} options.log
 * @param {typeof psnApi} [options.api]
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapeAuthorized({
  authorization,
  accountId = 'me',
  platform = PSN_PLATFORM,
  log,
  api = psnApi,
}) {
  log.info('Fetching played games');
  const titles = await fetchAllPlayedGames(api, authorization, accountId, log);
  log.info(`PSN reports ${titles.length} titles`);
  const games = convertPsnTitles(titles, log, platform);
  log.info(`${games.length} titles have playtime`);
  return games;
}

/**
 * Scrape one PSN account from an NPSSO token.
 * @param {object} options
 * @param {string} options.npsso
 * @param {string} [options.accountId]
 * @param {string} [options.platform]
 * @param {import('consola').ConsolaInstance} options.log
 * @param {typeof psnApi} [options.api]
 */
export async function scrapePsn({ npsso, accountId, platform, log, api = psnApi }) {
  log.start('Authenticating with PlayStation Network');
  const authorization = await authenticate(api, npsso);
  return scrapeAuthorized({ authorization, accountId, platform, log, api });
}

// ---------------------------------------------------------------------------
// Token acquisition
// ---------------------------------------------------------------------------

/**
 * Normalise a pasted NPSSO value: strips whitespace and quotes, and accepts
 * the whole {"npsso":"..."} JSON body from the ssocookie page.
 * @param {string} input
 * @returns {string|null} the token, or null if it doesn't look like one
 */
export function cleanNpsso(input) {
  let value = (input ?? '').trim();
  if (value.startsWith('{')) {
    try {
      value = JSON.parse(value).npsso ?? '';
    } catch {
      return null;
    }
  }
  value = value.replace(/^["']|["']$/g, '');
  return value.length === NPSSO_LENGTH ? value : null;
}

/** Environment variable holding the refresh token saved after a login, with the --suffix applied. */
export const refreshTokenEnvVar = (suffix) => suffixedEnvVar('PSN_REFRESH_TOKEN', suffix);

/** Default output filename, with the --suffix applied. */
export const psnOutputFile = (suffix) => suffixedFile('psn', suffix);

/**
 * Scrape one account. Authorization comes from the refresh token saved by an
 * earlier login (PSN_REFRESH_TOKEN); when there is none or it is rejected,
 * from logging in through the browser for an NPSSO token. The refresh token
 * PSN returns is saved before scraping, so a later failure never costs
 * another login.
 *
 * @param {object} options
 * @param {string} [options.suffix]  the --suffix option; selects the variables
 * @param {string} [options.platform]  display name written to each row
 * @param {import('consola').ConsolaInstance} options.log
 * @param {NodeJS.ProcessEnv} [options.env]  injectable for tests
 * @param {typeof promptForNpsso} [options.prompt]  injectable for tests
 * @param {typeof saveToken} [options.save]  injectable for tests
 * @param {typeof psnApi} [options.api]  injectable for tests
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapePsnAccount({
  suffix,
  platform = PSN_PLATFORM,
  log,
  env = process.env,
  prompt = promptForNpsso,
  save = saveToken,
  api = psnApi,
}) {
  const refreshVar = refreshTokenEnvVar(suffix);
  let authorization = null;

  if (env[refreshVar]) {
    log.start('Authenticating with PlayStation Network using the saved refresh token');
    try {
      authorization = await authorizeWithRefreshToken(api, env[refreshVar].trim());
    } catch (err) {
      log.warn(`${refreshVar} was rejected (${err.message}); falling back to browser login`);
    }
  }

  if (!authorization) {
    const npsso = await prompt(suffix, log);
    log.start('Authenticating with PlayStation Network');
    authorization = await authenticate(api, npsso);
  }

  if (authorization.refreshToken && authorization.refreshToken !== env[refreshVar]) {
    await save(refreshVar, authorization.refreshToken, log);
  }
  return scrapeAuthorized({ authorization, platform, log, api });
}

/**
 * Store a token that has just worked in .env, so the next run needs no
 * browser login.
 * @param {string} envVar
 * @param {string} token
 * @param {import('consola').ConsolaInstance} log
 */
export async function saveToken(envVar, token, log) {
  await saveEnvVar(envVar, token);
  log.success(`Saved ${envVar} to ${ENV_FILE}`);
}

/**
 * Walk the user through logging in and copying their NPSSO token.
 * @param {string|undefined} account  label, for the messages only
 * @param {import('consola').ConsolaInstance} log
 * @returns {Promise<string>}
 */
export async function promptForNpsso(suffix, log) {
  log.info(`Step 1: log in to the PlayStation account${suffix ? ` for "${suffix}"` : ''}`);
  await openInBrowser(LOGIN_URL, log);
  await pause('Logged in?');
  log.info('Step 2: copy the npsso value from the page that opens next');
  await openInBrowser(NPSSO_URL, log);
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = cleanNpsso(await askSecret('Paste the npsso value (or the whole JSON)'));
    if (token) return token;
    log.warn(`That doesn't look like an NPSSO token (expected ${NPSSO_LENGTH} characters). Try again.`);
  }
  throw new Error('No valid NPSSO token provided');
}
