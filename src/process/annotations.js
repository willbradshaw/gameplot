/**
 * Loading and cross-checking data/annotations.json. See docs/process.md.
 */

import fs from 'fs-extra';
import { annotationsSchema, parseOrThrow, tagsSchema } from '../lib/model.js';

/**
 * Read and validate the tag vocabulary.
 * @param {string} file
 * @returns {Promise<Record<string, string>>} tag -> description
 */
export async function loadTags(file) {
  return parseOrThrow(tagsSchema, await fs.readJson(file), file);
}

/**
 * Every tag used by an annotation must be in the vocabulary. Throws listing
 * each offending game and tag.
 * @param {import('../lib/model.js').Annotation[]} annotations
 * @param {Record<string, string>} tags
 * @param {string} [label]
 */
export function checkTags(annotations, tags, label = 'annotations') {
  const unknown = [];
  for (const a of annotations) {
    for (const t of a.tags) if (!(t in tags)) unknown.push(`"${a.game}": ${t}`);
  }
  if (unknown.length) {
    throw new Error(
      `${unknown.length} tag(s) in ${label} are not in the tag vocabulary:\n  ${unknown.join('\n  ')}`,
    );
  }
}

/**
 * Check the constraints zod cannot express: unique names, and aliases that
 * are neither another entry's name nor claimed twice.
 * @param {import('../lib/model.js').Annotation[]} annotations
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
 * @returns {Promise<import('../lib/model.js').Annotation[]>}
 */
export async function loadAnnotations(file) {
  const annotations = parseOrThrow(annotationsSchema, await fs.readJson(file), file);
  buildAliasMap(annotations, file);
  return annotations;
}
