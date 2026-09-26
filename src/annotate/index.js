/** Interactive status and rating updates. See docs/annotate.md. */

import { input as ask } from '@inquirer/prompts';
import fs from 'fs-extra';
import { parseOrThrow, rawGamesSchema, STATUSES } from '../lib/model.js';
import { buildAliasMap, checkTags, loadAnnotations, loadTags } from '../process/annotations.js';
import { buildPlatforms } from '../process/index.js';

/** Most recent corrected date across scraped platforms, including aliases. */
export function lastPlayedDates(rows, annotations) {
  const aliases = buildAliasMap(annotations);
  const groups = new Map();
  for (const row of rows) {
    const name = aliases.get(row.game) ?? row.game;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return new Map(
    annotations.map((annotation) => {
      const { elements } = buildPlatforms(annotation, groups.get(annotation.game) ?? []);
      const dates = elements
        .map((e) => e.lastPlayed)
        .filter(Boolean)
        .sort();
      return [annotation.game, dates.at(-1) ?? null];
    }),
  );
}

/** Strictly older than one calendar year, using UTC dates. */
export function isStale(date, now) {
  if (date === null) return false;
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  // Clamp February 29 to February 28 when the previous year was not a leap year.
  if (cutoff.getUTCMonth() !== now.getUTCMonth()) cutoff.setUTCDate(0);
  return date < cutoff.toISOString().slice(0, 10);
}

export function validateRating(value) {
  const text = value.trim();
  if (text === '') return true;
  return (
    (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Number(text) <= 10) ||
    'enter a decimal number from 0 to 10, or leave empty'
  );
}

async function askStatus(annotation, prompt, date = null) {
  const choices = STATUSES.map((status, i) => `${i + 1} = ${status}`).join(', ');
  const context = date ? `; last played ${date}; enter = still Active` : '';
  const answer = await prompt({
    message: `${annotation.game} — status (${choices}${context})`,
    validate: (value) => {
      const text = value.trim();
      return (
        (date !== null && text === '') ||
        STATUSES.some((_, i) => text === String(i + 1)) ||
        `enter a number from 1 to ${STATUSES.length}`
      );
    },
  });
  return answer.trim() === '' ? 'Active' : STATUSES[Number(answer.trim()) - 1];
}

/** Run three passes in file order, saving each changed answer before continuing. */
export async function annotateGames({ rows, annotations, prompt = ask, save, now = new Date() }) {
  const dates = lastPlayedDates(rows, annotations);
  const stale = annotations.filter((a) => a.status === 'Active' && isStale(dates.get(a.game), now));
  let updates = 0;
  const update = async (annotation, field, value) => {
    if (annotation[field] === value) return;
    annotation[field] = value;
    await save(annotations);
    updates += 1;
  };

  for (const annotation of annotations.filter((a) => a.status === null)) {
    await update(annotation, 'status', await askStatus(annotation, prompt));
  }
  for (const annotation of stale) {
    await update(annotation, 'status', await askStatus(annotation, prompt, dates.get(annotation.game)));
  }
  for (const annotation of annotations.filter((a) => a.status !== null && a.rating === null)) {
    const answer = await prompt({
      message: `${annotation.game} — rating (0–10; enter = still unrated)`,
      validate: validateRating,
    });
    if (answer.trim() !== '') await update(annotation, 'rating', Number(answer.trim()));
  }
  return updates;
}

export async function runAnnotate({ input, annotationsFile, tagsFile, log, prompt = ask, now = new Date() }) {
  const rows = parseOrThrow(rawGamesSchema, await fs.readJson(input), input);
  const annotations = await loadAnnotations(annotationsFile);
  checkTags(annotations, await loadTags(tagsFile), annotationsFile);
  const updates = await annotateGames({
    rows,
    annotations,
    prompt,
    now,
    save: (value) => fs.outputJson(annotationsFile, value, { spaces: 2 }),
  });
  log.success(`Saved ${updates} annotation updates to ${annotationsFile}`);
}
