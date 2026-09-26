/**
 * GOG scraper, via the endpoints the GOG Galaxy client uses. See
 * docs/scrape.md. Network access goes through an injectable `fetchImpl`.
 */

import { saveEnvVar } from '../lib/env.js';
import { ask, openInBrowser } from '../lib/prompt.js';
import {
  combineDuplicateIds,
  finalizeRawGames,
  mapWithConcurrency,
  suffixedEnvVar,
  suffixedFile,
} from './common.js';

export const GOG_PLATFORM = 'GOG';

/**
 * The GOG Galaxy client's public OAuth credentials, as used by every
 * third-party GOG tool. Not secrets: they identify the client, not the user.
 */
const CLIENT_ID = '46899977096215655';
const CLIENT_SECRET = '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';
const REDIRECT_URI = 'https://embed.gog.com/on_login_success?origin=client';
const AUTH_URL = `https://auth.gog.com/auth?${new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  layout: 'client2',
})}`;
const TOKEN_URL = 'https://auth.gog.com/token';
const EMBED_URL = 'https://embed.gog.com';
const PRODUCTS_URL = 'https://api.gog.com/products';
const DETAIL_CONCURRENCY = 8;

/** Thrown when GOG rejects the stored refresh token, so callers can fall back to a login. */
export class GogAuthError extends Error {}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Exchange either an authorization code or a refresh token for tokens.
 * @param {{ fetchImpl?: typeof fetch }} ctx
 * @param {{ code: string } | { refreshToken: string }} grant
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
export async function exchangeToken({ fetchImpl = fetch }, grant) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  if ('code' in grant) {
    params.set('grant_type', 'authorization_code');
    params.set('code', grant.code);
    params.set('redirect_uri', REDIRECT_URI);
  } else {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', grant.refreshToken);
  }
  const res = await fetchImpl(`${TOKEN_URL}?${params}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const reason = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new GogAuthError(
      `GOG rejected the ${'code' in grant ? 'authorization code' : 'refresh token'}: ${reason}`,
    );
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/**
 * Accept either the bare authorization code or the whole redirect URL it
 * appears in, since the browser shows the latter.
 * @param {string} input
 * @returns {string|null}
 */
export function extractAuthCode(input) {
  const value = (input ?? '').trim();
  if (!value) return null;
  try {
    const code = new URL(value).searchParams.get('code');
    if (code) return code;
  } catch {
    // Not a URL: treat as a bare code.
  }
  return /^[A-Za-z0-9_-]{10,}$/.test(value) ? value : null;
}

/**
 * Walk through the browser login and return the authorization code.
 * @param {import('consola').ConsolaInstance} log
 */
export async function promptForAuthCode(log) {
  log.info('Log in to GOG in the browser. Afterwards it shows a page whose address ends in "code=..."');
  await openInBrowser(AUTH_URL, log);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = extractAuthCode(await ask('Paste the address of that page (or just the code)'));
    if (code) return code;
    log.warn("That doesn't contain an authorization code. Try again.");
  }
  throw new Error('No authorization code provided');
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

async function embedGet({ accessToken, fetchImpl = fetch }, path) {
  const res = await fetchImpl(`${EMBED_URL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 || res.status === 403)
    throw new GogAuthError(`GOG rejected the access token (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`GOG request failed (HTTP ${res.status}) for ${path}`);
  return res.json();
}

/** @returns {Promise<number[]>} owned product ids */
export async function fetchOwnedIds(ctx) {
  const user = await embedGet(ctx, '/userData.json');
  if (!user?.isLoggedIn) throw new GogAuthError('GOG reports the session is not logged in');
  ctx.log?.info(`Account: ${user.username}`);
  const data = await embedGet(ctx, '/user/data/games');
  if (!Array.isArray(data?.owned)) throw new Error('GOG returned no owned-games list');
  return data.owned;
}

/**
 * Look up each owned product in GOG's public catalogue API, which needs no
 * authentication and reports the product type. Only `game` products become
 * rows: DLC is not a game in its own right, and a `pack` is a bundle whose
 * constituent games appear in the library separately.
 * @returns {Promise<{ id: number, title: string }[]>}
 */
export async function fetchProducts({ fetchImpl = fetch, log }, ids) {
  const skipped = [];
  const products = await mapWithConcurrency(ids, DETAIL_CONCURRENCY, async (id) => {
    const res = await fetchImpl(`${PRODUCTS_URL}/${id}`);
    if (res.status === 404) {
      log?.warn(`Product ${id} is not in GOG's catalogue any more; skipping`);
      return null;
    }
    if (!res.ok) throw new Error(`GOG catalogue request failed (HTTP ${res.status}) for product ${id}`);
    const product = await res.json();
    if (!product?.title) throw new Error(`GOG catalogue returned no title for product ${id}`);
    if (product.game_type !== 'game') {
      skipped.push(`${product.title} (${product.game_type})`);
      return null;
    }
    return { id, title: product.title };
  });
  if (skipped.length) {
    log?.info(
      `Skipped ${skipped.length} owned products that are DLC or packs rather than games; --verbose lists them`,
    );
    for (const s of skipped) log?.debug(`  ${s}`);
  }
  return products.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Conversion (pure)
// ---------------------------------------------------------------------------

/**
 * Convert owned products into RawGame rows. GOG reports ownership only, so
 * playtime and last-played are null and nothing is skipped.
 * @param {{ id: number, title: string }[]} products
 * @param {import('consola').ConsolaInstance} log
 * @param {string} [platform]
 */
export function convertGogProducts(products, log, platform = GOG_PLATFORM) {
  const rows = products.map((p) => ({
    game: p.title,
    platform,
    lastPlayed: null,
    hoursPlayed: null,
    id: p.id,
    url: `https://gogdb.org/product/${p.id}`,
  }));
  return finalizeRawGames(combineDuplicateIds(rows, log), 'GOG products');
}

/**
 * Scrape one GOG library given a working access token.
 * @param {{ accessToken: string, platform?: string, log: import('consola').ConsolaInstance, fetchImpl?: typeof fetch }} options
 */
export async function scrapeGog({ accessToken, platform = GOG_PLATFORM, log, fetchImpl }) {
  const ctx = { accessToken, fetchImpl, log };
  log.start('Fetching the GOG library');
  const ids = await fetchOwnedIds(ctx);
  log.info(`GOG reports ${ids.length} owned products; looking them up in the catalogue`);
  const products = await fetchProducts(ctx, ids);
  return convertGogProducts(products, log, platform);
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export const gogEnvVar = (suffix) => suffixedEnvVar('GOG_REFRESH_TOKEN', suffix);
export const gogOutputFile = (suffix) => suffixedFile('gog', suffix);

export async function saveGogToken(envVar, refreshToken, log) {
  await saveEnvVar(envVar, refreshToken);
  log.success(`Saved ${envVar} to .env`);
}

/**
 * Scrape one GOG account. The long-lived refresh token is read from the
 * environment and exchanged for an access token; if it is missing or
 * rejected, a browser login provides an authorization code instead. The
 * refresh token GOG returns is saved for next time either way, since GOG
 * rotates it.
 */
export async function scrapeGogAccount({
  suffix,
  platform = GOG_PLATFORM,
  log,
  env = process.env,
  prompt = promptForAuthCode,
  save = saveGogToken,
  fetchImpl,
}) {
  const envVar = gogEnvVar(suffix);
  const ctx = { fetchImpl };
  let tokens = null;

  if (env[envVar]) {
    try {
      tokens = await exchangeToken(ctx, { refreshToken: env[envVar].trim() });
    } catch (err) {
      if (!(err instanceof GogAuthError)) throw err;
      log.warn(`${err.message}; falling back to browser login`);
    }
  }
  if (!tokens) {
    const code = await prompt(log);
    tokens = await exchangeToken(ctx, { code });
  }

  // Save before scraping: a failure later in the run must not cost the user
  // another browser login next time.
  if (tokens.refreshToken && tokens.refreshToken !== env[envVar]) {
    await save(envVar, tokens.refreshToken, log);
  }
  return scrapeGog({ accessToken: tokens.accessToken, platform, log, fetchImpl });
}
