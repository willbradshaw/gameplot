/**
 * Fill in GOG playtime from the manual GOG annotations file.
 *
 * GOG's API reports which games you own but nothing about playtime, so the
 * scraper writes rows with null hours and dates. This step joins them with
 * data/manual/gog-annotations.json, keeping only annotated games: an
 * unannotated GOG game is treated as unplayed and left out.
 */

/**
 * @param {import('../shared/model.js').RawGame[]} gogGames  scraper output, hours/dates null
 * @param {import('../shared/model.js').GogAnnotation[]} annotations
 * @param {{ warn: Function, info: Function }} log
 * @returns {import('../shared/model.js').RawGame[]} annotated GOG rows, in annotation order
 */
export function applyGogAnnotations(gogGames, annotations, log) {
  const byName = new Map(gogGames.map((g) => [g.game, g]));
  const out = [];
  for (const a of annotations) {
    const game = byName.get(a.game);
    if (!game) {
      log.warn(`GOG annotation "${a.game}" matches no game in the GOG library`);
      continue;
    }
    out.push({ ...game, lastPlayed: a.lastPlayed, hoursPlayed: a.hoursPlayed });
  }
  log.info(`GOG: ${out.length} of ${gogGames.length} owned games have playtime annotations`);
  return out;
}
