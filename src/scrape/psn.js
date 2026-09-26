/**
 * PlayStation Network scraper. See docs/scrape.md for how authentication,
 * accounts and the output work. Network access goes through an injectable
 * `api` object so conversion and pagination are testable without credentials.
 */

import path from 'node:path';
import * as psnApi from 'psn-api';
import { ENV_FILE, saveEnvVar } from '../lib/env.js';
import { askSecret, confirm, openInBrowser, pause } from '../lib/prompt.js';
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
 * Scrape one PSN account.
 * @param {object} options
 * @param {string} options.npsso
 * @param {string} [options.accountId]  "me" for the authenticating account
 * @param {string} [options.platform]  display name written to each row
 * @param {import('consola').ConsolaInstance} options.log
 * @param {typeof psnApi} [options.api]  injectable for tests
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapePsn({ npsso, accountId = 'me', platform = PSN_PLATFORM, log, api = psnApi }) {
  log.start('Authenticating with PlayStation Network');
  const authorization = await authenticate(api, npsso);
  log.info('Fetching played games');
  const titles = await fetchAllPlayedGames(api, authorization, accountId, log);
  log.info(`PSN reports ${titles.length} titles`);
  const games = convertPsnTitles(titles, log, platform);
  log.info(`${games.length} titles have playtime`);
  return games;
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

/** Environment variable holding the NPSSO token, with the --suffix applied. */
export const npssoEnvVar = (suffix) => suffixedEnvVar('PSN_NPSSO', suffix);

/** Default output filename, with the --suffix applied. */
export const psnOutputFile = (suffix) => suffixedFile('psn-games', suffix);

/**
 * Scrape one account, resolving the NPSSO token first.
 *
 * The token comes from the environment when present and valid. If it is
 * absent, malformed, or rejected by PSN (tokens expire after roughly two
 * months), the user is walked through fetching a fresh one in the browser.
 *
 * @param {object} options
 * @param {string} [options.suffix]  the --suffix option; selects the token variable
 * @param {string} [options.platform]  display name written to each row
 * @param {import('consola').ConsolaInstance} options.log
 * @param {NodeJS.ProcessEnv} [options.env]  injectable for tests
 * @param {typeof promptForNpsso} [options.prompt]  injectable for tests
 * @param {typeof psnApi} [options.api]  injectable for tests
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapePsnAccount({
  suffix,
  platform = PSN_PLATFORM,
  log,
  env = process.env,
  prompt = promptForNpsso,
  save = offerToSaveToken,
  api,
}) {
  const envVar = npssoEnvVar(suffix);
  const fromEnv = cleanNpsso(env[envVar]);
  if (env[envVar] && !fromEnv) log.warn(`${envVar} is set but is not a valid NPSSO token; ignoring it`);

  if (fromEnv) {
    try {
      return await scrapePsn({ npsso: fromEnv, platform, log, api });
    } catch (err) {
      log.warn(`Token from ${envVar} was rejected (${err.message}); falling back to browser login`);
    }
  }
  const npsso = await prompt(suffix, log);
  const games = await scrapePsn({ npsso, platform, log, api });
  await save(envVar, npsso, log);
  return games;
}

/**
 * After a token obtained interactively has worked, offer to store it in .env
 * so the next run needs no browser login.
 * @param {string} envVar
 * @param {string} token
 * @param {import('consola').ConsolaInstance} log
 */
export async function offerToSaveToken(envVar, token, log) {
  if (!(await confirm(`Save this token to ${path.basename(ENV_FILE)} as ${envVar} for next time?`))) return;
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
  log.info(`Step 1: log in to your PlayStation account${suffix ? ` ("${suffix}")` : ''}`);
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
