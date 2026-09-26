/**
 * Repo paths (used only as command defaults) and the .env file.
 *
 * Secrets are read from environment variables. A gitignored `.env` at the
 * repo root is loaded if present, via Node's built-in parser; variables
 * already set in the environment take precedence. Scrapers that obtain a
 * credential interactively offer to save it there with `saveEnvVar`, so the
 * user never edits the file by hand.
 */

import { existsSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DATA_DIR = path.join(REPO_ROOT, 'data', 'raw');
export const RAW_BATCH_FILE = path.join(RAW_DATA_DIR, 'batch.json');
export const ANNOTATIONS_FILE = path.join(REPO_ROOT, 'data', 'annotations.json');
export const GAMES_FILE = path.join(REPO_ROOT, 'data', 'games.json');
export const UNANNOTATED_FILE = path.join(REPO_ROOT, 'data', 'unannotated.json');
export const ENV_FILE = path.join(REPO_ROOT, '.env');

/** Load a .env file into process.env if it exists. Safe to call more than once. */
export function loadDotEnv(file = ENV_FILE) {
  if (!existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}

/**
 * Set one variable in a .env file, replacing an existing assignment or
 * appending a new one, and leaving every other line untouched. The file is
 * created if missing and kept readable only by the owner.
 * @param {string} name
 * @param {string} value
 * @param {string} [file]
 */
export async function saveEnvVar(name, value, file = ENV_FILE) {
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  const lines = existing.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const assignment = `${name}=${value}`;
  const pattern = new RegExp(`^(export\\s+)?${name}=`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) lines.push(assignment);
  else lines[index] = assignment;
  await writeFile(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  process.env[name] = value;
}
