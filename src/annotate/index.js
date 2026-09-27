/** Interactive status and rating updates. See docs/annotate.md. */

import { input as ask } from '@inquirer/prompts';
import { LogLevels } from 'consola';
import fs from 'fs-extra';
import { parseOrThrow, rawGamesSchema, STATUSES } from '../lib/model.js';
import { confirm as askConfirm } from '../lib/prompt.js';
import {
  buildAliasMap,
  checkTags,
  isBlankAnnotation,
  loadAnnotations,
  loadTags,
} from '../process/annotations.js';
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
    message: `${annotation.game}${context}`,
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
  buildAliasMap(annotations);
  let updates = 0;
  const pending = annotations.filter((a) => a.possible_aliases);
  if (pending.length)
    notice(
      `\nAlias review — ${pending.length} game${pending.length === 1 ? '' : 's'}\nChoose an existing game, 0 for a separate game, or Enter to decide later.`,
    );
  for (const entry of pending) {
    if (!annotations.includes(entry) || !entry.possible_aliases) continue;
    const blank = isBlankAnnotation(entry);
    const choices = entry.possible_aliases;
    notice(choices.map((name, i) => `${i + 1} = ${name}`).join('\n'));
    const answer = (
      await prompt({
        message: `${entry.game}${blank ? '' : ' (has annotations; only separate or skip)'}`,
        validate: (value) =>
          value.trim() === '' ||
          value.trim() === '0' ||
          (blank && choices.some((_, i) => value.trim() === String(i + 1))) ||
          (blank
            ? `enter 0–${choices.length}, or leave empty`
            : 'entry has annotations; enter 0 or leave empty'),
      })
    ).trim();
    if (answer === '') continue;
    if (answer === '0') {
      delete entry.possible_aliases;
    } else {
      if (!isBlankAnnotation(entry)) throw new Error(`Cannot merge "${entry.game}": entry has annotations`);
      const target = annotations.find((a) => a.game === choices[Number(answer) - 1]);
      if (!target) throw new Error('invalid alias review answer');
      target.aliases = [...new Set([...(target.aliases ?? []), entry.game, ...(entry.aliases ?? [])])];
      annotations.splice(annotations.indexOf(entry), 1);
      for (const other of annotations) {
        if (!other.possible_aliases) continue;
        other.possible_aliases = [
          ...new Set(
            other.possible_aliases
              .map((name) => (name === entry.game ? target.game : name))
              .filter((name) => name !== other.game),
          ),
        ];
        if (!other.possible_aliases.length) delete other.possible_aliases;
      }
    }
    buildAliasMap(annotations);
    await save(annotations);
    updates += 1;
  }
  const eligible = annotations.filter((a) => !a.possible_aliases);
  const dates = lastPlayedDates(rows, annotations);
  const stale = eligible.filter((a) => a.status === 'Active' && isStale(dates.get(a.game), now, months));
  const recentUnplayed = eligible.filter(
    (a) => a.status === 'Unplayed' && isRecent(dates.get(a.game), now, months),
  );
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
  const missing = eligible.filter((a) => a.status === null);
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
  const unrated = eligible.filter(
    (a) => (a.status === 'Complete' || a.status === 'Abandoned') && a.rating === null,
  );
  step(
    4,
    'Missing ratings',
    unrated.length,
    'Rate Complete or Abandoned games from 0 to 10, or press Enter to skip for now.',
  );
  const rate = async (games) => {
    for (const annotation of games) {
      const answer = await prompt({
        message: annotation.game,
        validate: validateRating,
      });
      if (answer.trim() !== '') await update(annotation, 'rating', Number(answer.trim()));
    }
  };
  await rate(unrated);
  const activeUnrated = eligible.filter((a) => a.status === 'Active' && a.rating === null);
  step(
    5,
    'Active games without ratings',
    activeUnrated.length,
    'Enter a number from 0 to 10, or press Enter to leave unrated.',
  );
  await rate(activeUnrated);
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
  const stepLog = log.create({ level: log.level === LogLevels.warn ? LogLevels.log : log.level });
  const updates = await annotateGames({
    rows,
    annotations,
    prompt,
    confirm,
    now,
    months,
    // Step instructions are part of the prompts, including in quiet mode.
    notice: (message) => stepLog.log(message),
    save: (value) => fs.outputJson(annotationsFile, value, { spaces: 2 }),
  });
  log.success(`Saved ${updates} annotation updates to ${annotationsFile}`);
}
