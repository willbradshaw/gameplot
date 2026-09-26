/**
 * Helpers for the two scalar types the pipeline aggregates: decimal hours
 * and YYYY-MM-DD date strings.
 */

/** Round to one decimal place, avoiding float noise like 12.299999. */
export const roundHours = (h) => Math.round(h * 10) / 10;

/**
 * The later of two YYYY-MM-DD dates, treating null as "unknown" rather than
 * "earliest". ISO date strings compare correctly as plain strings.
 * @param {string|null} a
 * @param {string|null} b
 * @returns {string|null}
 */
export function laterDate(a, b) {
  if (a === null || a === undefined) return b ?? null;
  if (b === null || b === undefined) return a;
  return a >= b ? a : b;
}
