/**
 * A small, dependency-free schema validator.
 *
 * It exists so the pipeline and the browser can share one description of the
 * data model (see model.js) without pulling in a validation library. It
 * supports exactly what the game records need and nothing more.
 *
 * Schema nodes:
 *   { type: 'string',  nullable?, enum?, minLength?, emptyToNull? }
 *   { type: 'number',  nullable?, min?, max?, integer?, coerceFromString? }
 *   { type: 'date',    nullable? }                 // 'YYYY-MM-DD' strings
 *   { type: 'boolean', nullable? }
 *   { type: 'array',   items }
 *   { type: 'object',  properties, required?, additionalProperties? }
 *   { anyOf: [node, node, ...] }
 *
 * `validate` returns a *normalised copy* of the value, so schemas can apply
 * gentle coercions (numeric strings in hand-edited files, "" -> null for
 * URLs) while recording a warning for each one.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {{ path: string, message: string }} Issue
 * @typedef {{ ok: boolean, value: any, errors: Issue[], warnings: Issue[] }} Result
 */

/**
 * Validate `value` against `schema`.
 * @param {any} value
 * @param {object} schema
 * @param {string} [path] label used in messages, e.g. "[3].hoursPlayed"
 * @returns {Result}
 */
export function validate(value, schema, path = '$') {
  const errors = [];
  const warnings = [];
  const out = check(value, schema, path, errors, warnings);
  return { ok: errors.length === 0, value: out, errors, warnings };
}

/**
 * Validate and throw a descriptive error if invalid. Returns the normalised
 * value. `onWarning` receives each coercion warning if supplied.
 * @template T
 * @param {any} value
 * @param {object} schema
 * @param {string} label human-readable source, e.g. a file path
 * @param {{ onWarning?: (issue: Issue) => void }} [options]
 * @returns {T}
 */
export function assertValid(value, schema, label, { onWarning } = {}) {
  const result = validate(value, schema, label);
  if (onWarning) result.warnings.forEach(onWarning);
  if (!result.ok) {
    const shown = result.errors.slice(0, 20).map((e) => `  ${e.path}: ${e.message}`);
    const more = result.errors.length > 20 ? `\n  ...and ${result.errors.length - 20} more` : '';
    throw new Error(`Validation failed for ${label}:\n${shown.join('\n')}${more}`);
  }
  return result.value;
}

function check(value, schema, path, errors, warnings) {
  if (schema.anyOf) {
    // First branch that validates cleanly wins; otherwise report the branch
    // with the fewest errors so the message points at the likely intent.
    let best = null;
    for (const branch of schema.anyOf) {
      const r = validate(value, branch, path);
      if (r.ok) {
        warnings.push(...r.warnings);
        return r.value;
      }
      if (!best || r.errors.length < best.errors.length) best = r;
    }
    errors.push(...best.errors);
    return value;
  }

  if (value === null || value === undefined) {
    if (schema.nullable) return null;
    errors.push({ path, message: `must not be null (expected ${schema.type})` });
    return value;
  }

  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push({ path, message: `expected string, got ${describe(value)}` });
        return value;
      }
      if (schema.emptyToNull && value === '') {
        if (!schema.nullable) errors.push({ path, message: 'must not be empty' });
        return null;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({ path, message: `must be at least ${schema.minLength} characters` });
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push({ path, message: `must be one of ${schema.enum.join(', ')}; got "${value}"` });
      }
      return value;
    }

    case 'number': {
      let n = value;
      if (typeof n === 'string' && schema.coerceFromString && n.trim() !== '' && Number.isFinite(Number(n))) {
        n = Number(n);
        warnings.push({ path, message: `numeric string "${value}" coerced to ${n}` });
      }
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        errors.push({ path, message: `expected number, got ${describe(value)}` });
        return value;
      }
      if (schema.integer && !Number.isInteger(n)) errors.push({ path, message: `expected integer, got ${n}` });
      if (schema.min !== undefined && n < schema.min) errors.push({ path, message: `must be >= ${schema.min}, got ${n}` });
      if (schema.max !== undefined && n > schema.max) errors.push({ path, message: `must be <= ${schema.max}, got ${n}` });
      return n;
    }

    case 'date': {
      if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
        errors.push({ path, message: `expected YYYY-MM-DD date string, got ${describe(value)}` });
      }
      return value;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') errors.push({ path, message: `expected boolean, got ${describe(value)}` });
      return value;
    }

    case 'array': {
      if (!Array.isArray(value)) {
        errors.push({ path, message: `expected array, got ${describe(value)}` });
        return value;
      }
      return value.map((item, i) => check(item, schema.items, `${path}[${i}]`, errors, warnings));
    }

    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({ path, message: `expected object, got ${describe(value)}` });
        return value;
      }
      const out = {};
      const props = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        if (!(key in value)) errors.push({ path: `${path}.${key}`, message: 'is required' });
      }
      for (const [key, sub] of Object.entries(props)) {
        if (key in value) out[key] = check(value[key], sub, `${path}.${key}`, errors, warnings);
      }
      for (const key of Object.keys(value)) {
        if (key in props) continue;
        if (schema.additionalProperties === false) {
          errors.push({ path: `${path}.${key}`, message: 'unexpected property' });
        } else {
          out[key] = value[key];
        }
      }
      return out;
    }

    default:
      throw new Error(`Unknown schema type: ${schema.type}`);
  }
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return `string "${value.length > 40 ? value.slice(0, 40) + '…' : value}"`;
  return typeof value;
}
