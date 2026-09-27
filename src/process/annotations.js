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

  for (const a of annotations) {
    for (const target of a.possible_aliases ?? []) {
      if (!names.has(target) || target === a.game) {
        throw new Error(`In ${label}, invalid possible_aliases target "${target}" for "${a.game}"`);
      }
    }
  }

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

/** Ignore cosmetic differences while retaining words and sequel numbers. */
export function aliasNameKey(value) {
  return value
    .replace(/[™®©]/gu, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Mean of shared-prefix ratio and normalized Levenshtein similarity. */
export function nameSimilarity(left, right) {
  const a = Array.from(aliasNameKey(left));
  const b = Array.from(aliasNameKey(right));
  if (!a.length || !b.length) return 0;
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return (prefix / Math.min(a.length, b.length) + 1 - previous[b.length] / Math.max(a.length, b.length)) / 2;
}

/** Rank every plausible unmatched entry, including pending rename suggestions. */
export function suggestAliases(game, candidates) {
  return candidates
    .map((a) => ({
      game: a.game,
      score: Math.max(...[a.game, ...(a.aliases ?? [])].map((name) => nameSimilarity(game, name))),
    }))
    .filter((a) => a.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.game.localeCompare(b.game, 'en'))
    .map((a) => a.game);
}

/** Known names can be transferred; personal annotations must never be discarded. */
export function isBlankAnnotation(a) {
  return (
    a.rating === null && a.status === null && a.tags.length === 0 && !Object.keys(a.playtime ?? {}).length
  );
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
