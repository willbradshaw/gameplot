/**
 * JSON file helpers.
 *
 * Reads give a clear error naming the file on malformed JSON. Writes are
 * atomic (write to a temp file, then rename) so a crash mid-write never
 * leaves a half-written data file behind, and always end with a newline
 * so the committed files diff cleanly.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} filePath
 * @returns {Promise<unknown>}
 */
export async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }
}

/**
 * @param {string} filePath
 * @param {unknown} data
 */
export async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(tmp, filePath);
}
