/**
 * Repo paths (used only as command defaults) and .env loading.
 *
 * Secrets are read from environment variables. A gitignored `.env` at the
 * repo root is loaded if present, via Node's built-in parser; variables
 * already set in the environment take precedence.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DATA_DIR = path.join(REPO_ROOT, 'data', 'games-raw');

/** Load <repo>/.env into process.env if the file exists. Safe to call more than once. */
export function loadDotEnv(file = path.join(REPO_ROOT, '.env')) {
  if (!existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}
