/** Argument parsers shared by standalone commands and the pipeline. */
import { InvalidArgumentError } from 'commander';

export function parseSuffix(value) {
  const suffix = value.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(suffix)) {
    throw new InvalidArgumentError('must be letters, digits or dashes (it becomes part of a filename)');
  }
  return suffix;
}

export function parseStep(value) {
  if (!/^[1-7]$/.test(value)) throw new InvalidArgumentError('must be a whole number from 1 to 7');
  return Number(value);
}

export function parseMonths(value) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new InvalidArgumentError('must be a positive whole number');
  }
  return Number(value);
}
