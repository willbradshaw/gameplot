/**
 * Vocabulary shared by the pipeline and the dashboard.
 *
 * This file must stay free of imports so the browser can load it directly
 * without a build step. Schemas that depend on zod live in model.js.
 */

/** Platforms the scrapers produce. */
export const PLATFORMS = ['Steam', 'PS5', 'Xbox', 'GOG'];
