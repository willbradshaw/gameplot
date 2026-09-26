/**
 * PlayStation Network scraper.
 *
 * Uses the psn-api library to read the "played games" list of an account.
 * Authentication is by NPSSO token, a 64-character cookie value that acts as
 * a password: it is read from the environment (see .env.example) and, when
 * missing or rejected, obtained interactively by logging in through the
 * browser and copying the value from Sony's ssocookie endpoint.
 *
 * One run scrapes one account. Users with several PSN accounts give each a
 * label (--account uk), which selects the token variable and output file;
 * with a single account no label is needed. Every game is recorded as
 * platform "PS5" regardless of the title's category.
 *
 * All network access goes through an injectable `api` object so the
 * conversion and pagination logic can be tested without credentials.
 */

import * as psnApi from 'psn-api';
import { ask, openInBrowser } from '../lib/prompt.js';
import { combineDuplicateIds, finalizeRawGames, isoToDate, roundHours } from './common.js';

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
 * @param {{ info: Function }} log
 * @returns {import('../shared/model.js').RawGame[]}
 */
export function convertPsnTitles(titles, log) {
  const rows = [];
  for (const t of titles) {
    if (!t.playDuration || t.playDuration === 'PT0S') continue;
    const id = t.concept?.id ?? t.titleId;
    rows.push({
      game: t.localizedName || t.name || `Unknown Game (${id})`,
      platform: PSN_PLATFORM,
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
 * @param {{ info: Function, debug: Function }} log
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
 * @param {{ info: Function, debug: Function }} options.log
 * @param {typeof psnApi} [options.api]  injectable for tests
 * @returns {Promise<import('../shared/model.js').RawGame[]>}
 */
export async function scrapePsn({ npsso, accountId = 'me', log, api = psnApi }) {
  log.info('Authenticating with PlayStation Network');
  const authorization = await authenticate(api, npsso);
  log.info('Fetching played games');
  const titles = await fetchAllPlayedGames(api, authorization, accountId, log);
  log.info(`PSN reports ${titles.length} titles`);
  const games = convertPsnTitles(titles, log);
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

/**
 * Environment variable holding the NPSSO token: PSN_NPSSO, or
 * PSN_NPSSO_<LABEL> when an account label is given.
 * @param {string} [account]
 */
export const npssoEnvVar = (account) => (account ? `PSN_NPSSO_${account.toUpperCase()}` : 'PSN_NPSSO');

/**
 * Output filename: psn-games.json, or psn-games-<label>.json with a label.
 * @param {string} [account]
 */
export const psnOutputFile = (account) => (account ? `psn-games-${account}.json` : 'psn-games.json');

/**
 * Walk the user through logging in and copying their NPSSO token.
 * @param {string|undefined} account  label, for the messages only
 * @param {{ info: Function }} log
 * @returns {Promise<string>}
 */
export async function promptForNpsso(account, log) {
  log.info(`Step 1: log in to your PlayStation account${account ? ` ("${account}")` : ''}`);
  await openInBrowser(LOGIN_URL, log);
  await ask('Press Enter once you are logged in... ');
  log.info('Step 2: copy the npsso value from the page that opens next');
  await openInBrowser(NPSSO_URL, log);
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = cleanNpsso(await ask('Paste the npsso value (or the whole JSON): '));
    if (token) {
      log.info(`Tip: put it in .env as ${npssoEnvVar(account)}=... to skip this next time`);
      return token;
    }
    log.info(`That doesn't look like an NPSSO token (expected ${NPSSO_LENGTH} characters). Try again.`);
  }
  throw new Error('No valid NPSSO token provided');
}
