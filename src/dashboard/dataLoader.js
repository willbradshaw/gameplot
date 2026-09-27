// Loads the processed dashboard document described in docs/process.md.
let gameData = [];
let generatedAt = null;

export async function loadGameData(fetchData = fetch) {
    gameData = [];
    generatedAt = null;
    const response = await fetchData('./data/games.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load data/games.json (HTTP ${response.status})`);
    const data = await response.json();
    if (!data || !Array.isArray(data.games) || typeof data.generatedAt !== 'string' ||
        !Number.isFinite(Date.parse(data.generatedAt))) {
        throw new Error('Invalid dashboard document; regenerate data/games.json with gameplot process');
    }
    gameData = data.games;
    generatedAt = data.generatedAt;
    return gameData;
}

export function getGameData() {
    return gameData;
}

export function getGeneratedAt() {
    return generatedAt;
}
