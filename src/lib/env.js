/**
 * Repo paths and .env loading.
 *
 * Secrets (API keys, login tokens) are read from environment variables. A
 * gitignored `.env` file at the repo root is loaded if present, using Node's
 * built-in parser, so no dotenv dependency is needed. Variables already set
 * in the environment take precedence over the file.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const RAW_DATA_DIR = path.join(DATA_DIR, 'games-raw');

/** Load <repo>/.env into process.env if the file exists. Safe to call more than once. */
export function loadDotEnv(file = path.join(REPO_ROOT, '.env')) {
  if (!existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}
