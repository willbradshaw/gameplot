/**
 * Loading and cross-checking data/annotations.json. See docs/process.md.
 */

import fs from 'fs-extra';
import { annotationsSchema, parseOrThrow } from '../shared/model.js';

/**
 * Check the constraints zod cannot express: unique names, and aliases that
 * are neither another entry's name nor claimed twice.
 * @param {import('../shared/model.js').Annotation[]} annotations
 * @param {string} label
 * @returns {Map<string, string>} alias -> canonical name
 */
export function buildAliasMap(annotations, label = 'annotations') {
  const names = new Set();
  const dupes = new Set();
  for (const a of annotations) (names.has(a.game) ? dupes : names).add(a.game);
  if (dupes.size)
    throw new Error(`Duplicate names in ${label}: ${[...dupes].map((d) => `"${d}"`).join(', ')}`);

  const aliasTo = new Map();
  for (const a of annotations) {
    for (const alias of a.aliases ?? []) {
      if (alias === a.game) continue;
      if (names.has(alias))
        throw new Error(`In ${label}, alias "${alias}" of "${a.game}" is also an entry's name`);
      const prior = aliasTo.get(alias);
      if (prior && prior !== a.game) {
        throw new Error(`In ${label}, alias "${alias}" belongs to both "${prior}" and "${a.game}"`);
      }
      aliasTo.set(alias, a.game);
    }
  }
  return aliasTo;
}

/**
 * Read and validate an annotations file.
 * @param {string} file
 * @returns {Promise<import('../shared/model.js').Annotation[]>}
 */
export async function loadAnnotations(file) {
  const annotations = parseOrThrow(annotationsSchema, await fs.readJson(file), file);
  buildAliasMap(annotations, file);
  return annotations;
}
