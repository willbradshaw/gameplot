/**
 * Minimal leveled logger writing timestamped lines to stderr.
 *
 * stderr is used so that command output (stdout) stays clean for piping.
 * Timestamps are UTC to match the convention of the original pipeline.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/**
 * @param {{ level?: keyof typeof LEVELS, stream?: NodeJS.WritableStream }} [options]
 */
export function createLogger({ level = 'info', stream = process.stderr } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (name, args) => {
    if (LEVELS[name] < threshold) return;
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    stream.write(`[${timestamp()}] ${name.toUpperCase().padEnd(5)} ${msg}\n`);
  };
  return {
    level,
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
  };
}

/** A logger that discards everything. Handy in tests. */
export const silentLogger = createLogger({ level: 'silent' });
