/**
 * Logging, via consola.
 *
 * Every command creates one logger from its --verbose/--quiet flags and
 * passes it down, so library code never logs to a global. Tests pass
 * `silentLogger`.
 */

import { createConsola, LogLevels } from 'consola';

/**
 * @param {{ verbose?: boolean, quiet?: boolean }} [flags]
 * @returns {import('consola').ConsolaInstance}
 */
export function createLogger({ verbose = false, quiet = false } = {}) {
  const level = verbose ? LogLevels.debug : quiet ? LogLevels.warn : LogLevels.info;
  return createConsola({ level });
}

/** A logger that discards everything. */
export const silentLogger = createConsola({ level: LogLevels.silent });
