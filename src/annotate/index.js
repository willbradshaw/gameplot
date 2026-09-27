/** Interactive status and rating updates. See docs/annotate.md. */

import { input as ask } from '@inquirer/prompts';
import fs from 'fs-extra';
import { parseOrThrow, rawGamesSchema, STATUSES } from '../lib/model.js';
import { confirm as askConfirm } from '../lib/prompt.js';
import { buildAliasMap, checkTags, loadAnnotations, loadTags } from '../process/annotations.js';
import { buildPlatforms } from '../process/index.js';

const STATUS_CHOICES = ['Unplayed', ...STATUSES.filter((status) => status !== 'Unplayed')];

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

/** UTC calendar-month cutoff, clamped to the last day of a shorter month. */
export function monthCutoff(now, months = 12) {
  if (!Number.isSafeInteger(months) || months < 1) throw new Error('months must be a positive whole number');
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const lastDay = new Date(cutoff);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  cutoff.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  if (Number.isNaN(cutoff.getTime()) || cutoff.getUTCFullYear() < 0) throw new Error('months is too large');
  return cutoff.toISOString().slice(0, 10);
}

export function isStale(date, now, months = 12) {
  return date !== null && date < monthCutoff(now, months);
}

export function isRecent(date, now, months = 12) {
  return date !== null && date >= monthCutoff(now, months) && date <= now.toISOString().slice(0, 10);
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
  const context = date ? ` (${annotation.status}, last played ${date})` : '';
  const answer = await prompt({
    message: `${annotation.game} — status${context}`,
    validate: (value) => {
      const text = value.trim();
      return (
        text === '' ||
        STATUS_CHOICES.some((_, i) => text === String(i)) ||
        `enter a number from 0 to ${STATUS_CHOICES.length - 1}`
      );
    },
  });
  return answer.trim() === '' ? annotation.status : STATUS_CHOICES[Number(answer.trim())];
}

/** Run status and rating prompts, saving each changed answer before continuing. */
export async function annotateGames({
  rows,
  annotations,
  prompt = ask,
  confirm = askConfirm,
  save,
  notice = () => {},
  now = new Date(),
  months = 12,
}) {
  monthCutoff(now, months);
  const dates = lastPlayedDates(rows, annotations);
  const stale = annotations.filter((a) => a.status === 'Active' && isStale(dates.get(a.game), now, months));
  const recentUnplayed = annotations.filter(
    (a) => a.status === 'Unplayed' && isRecent(dates.get(a.game), now, months),
  );
  let updates = 0;
  const update = async (annotation, field, value) => {
    if (annotation[field] === value) return;
    annotation[field] = value;
    await save(annotations);
    updates += 1;
  };

  const updateStatus = async (annotation, date = null) => {
    const status = await askStatus(annotation, prompt, date);
    const next = structuredClone(annotation);
    next.status = status;
    if (status === 'Unplayed') {
      const names = new Set([annotation.game, ...(annotation.aliases ?? [])]);
      const platforms = new Set([
        ...rows.filter((row) => names.has(row.game)).map((row) => row.platform),
        ...Object.keys(annotation.playtime ?? {}),
      ]);
      if (platforms.size) next.playtime ??= {};
      for (const platform of platforms)
        next.playtime[platform] = { ...next.playtime[platform], hoursPlayed: 0 };
    } else if (
      annotation.status === 'Unplayed' &&
      Object.values(next.playtime ?? {}).some((c) => c.hoursPlayed === 0)
    ) {
      if (await confirm(`${annotation.game} — remove zero-hour corrections to restore scraped playtime?`)) {
        for (const [platform, correction] of Object.entries(next.playtime)) {
          if (correction.hoursPlayed === 0) delete correction.hoursPlayed;
          if (Object.keys(correction).length === 0) delete next.playtime[platform];
        }
        if (Object.keys(next.playtime).length === 0) delete next.playtime;
      }
    }
    if (JSON.stringify(next) === JSON.stringify(annotation)) return;
    if (!next.playtime) delete annotation.playtime;
    Object.assign(annotation, next);
    await save(annotations);
    updates += 1;
  };

  const choices = STATUS_CHOICES.map((status, i) => `${i} = ${status}`).join(', ');
  const step = (number, title, count, instructions) =>
    notice(
      `\nStep ${number}: ${title} — ${count} game${count === 1 ? '' : 's'}${count ? `\n${instructions}` : ''}`,
    );
  const missing = annotations.filter((a) => a.status === null);
  step(1, 'Missing statuses', missing.length, `${choices}\nEnter skips a game for now.`);
  for (const annotation of missing) {
    await updateStatus(annotation);
  }
  step(2, `Active, last played over ${months} months ago`, stale.length, `${choices}\nEnter keeps Active.`);
  for (const annotation of stale) {
    await updateStatus(annotation, dates.get(annotation.game));
  }
  step(
    3,
    `Unplayed, last played within ${months} months`,
    recentUnplayed.length,
    `${choices}\nEnter keeps Unplayed.`,
  );
  for (const annotation of recentUnplayed) {
    await updateStatus(annotation, dates.get(annotation.game));
  }
  const unrated = annotations.filter(
    (a) => a.status !== null && a.status !== 'Unplayed' && a.rating === null,
  );
  step(4, 'Missing ratings', unrated.length, 'Enter a number from 0 to 10, or press Enter to skip for now.');
  for (const annotation of unrated) {
    const answer = await prompt({
      message: `${annotation.game} — rating`,
      validate: validateRating,
    });
    if (answer.trim() !== '') await update(annotation, 'rating', Number(answer.trim()));
  }
  return updates;
}

export async function runAnnotate({
  input,
  annotationsFile,
  tagsFile,
  log,
  prompt = ask,
  confirm = askConfirm,
  now = new Date(),
  months = 12,
}) {
  const rows = parseOrThrow(rawGamesSchema, await fs.readJson(input), input);
  const annotations = await loadAnnotations(annotationsFile);
  checkTags(annotations, await loadTags(tagsFile), annotationsFile);
  const updates = await annotateGames({
    rows,
    annotations,
    prompt,
    confirm,
    now,
    months,
    // Step instructions are part of the prompts, including in quiet mode.
    notice: (message) => log.log({ message, level: 0 }),
    save: (value) => fs.outputJson(annotationsFile, value, { spaces: 2 }),
  });
  log.success(`Saved ${updates} annotation updates to ${annotationsFile}`);
}
