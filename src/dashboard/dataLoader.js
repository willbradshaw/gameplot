export async function loadGameData(dataUrl = './data/games.json', { fetchData = fetch, signal } = {}) {
  const response = await fetchData(dataUrl, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Could not load ${dataUrl} (HTTP ${response.status})`);
  const data = await response.json();
  if (
    !data ||
    !Array.isArray(data.games) ||
    typeof data.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.generatedAt))
  ) {
    throw new Error('Invalid dashboard document; regenerate data/games.json with gameplot process');
  }
  return data;
}
