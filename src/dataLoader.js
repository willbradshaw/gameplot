// Data loading and processing module

// Global data storage
let gameData = [];

/**
 * Load and process game data from JSON file
 * @returns {Promise<Array>} Processed game data
 */
export async function loadGameData() {
    try {
        const response = await fetch('data/merged-games.json');
        const jsonData = await response.json();
        
        // Process the data - convert date strings to Date objects
        gameData = jsonData.map(d => ({
            ...d,
            firstPlayedDate: new Date(d.firstPlayed),
            lastPlayedDate: new Date(d.lastPlayed),
            displayDate: new Date(d.lastPlayed)
        }));

        console.log('✅ Data loaded successfully:', gameData.length, 'games');
        return gameData;
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        
        // Show error message to user
        document.querySelector('.container').innerHTML = `
            <div style="text-align: center; margin-top: 100px;">
                <h2 style="color: #ff6b6b;">⚠️ Could not load game data</h2>
                <p style="color: #a0a0a0; margin: 20px 0;">
                    Make sure <code>games.json</code> is in the same directory and you're running a local server.
                </p>
                <p style="color: #a0a0a0; font-size: 0.9em;">
                    Try: <code>python -m http.server 8000</code> or <code>npx serve .</code>
                </p>
            </div>
        `;
        throw error;
    }
}

/**
 * Get the current game data
 * @returns {Array} Current game data array
 */
export function getGameData() {
    return gameData;
}

/**
 * Set game data (useful for testing or external data sources)
 * @param {Array} data - Game data array
 */
export function setGameData(data) {
    gameData = data;
}

// Log data format instructions
console.log("📊 JSON Data Format:");
console.log("Your JSON should be an array of game objects with properties: game, platform, tags (array), rating, firstPlayed, lastPlayed, hoursPlayed, status, notes");
console.log("🚀 To use your own data: Replace games.json with your data file");
console.log("☁️ For S3 hosting: Update the fetch URL in loadData() function"); 