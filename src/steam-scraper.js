const https = require('https');
const fs = require('fs');

/**
 * Scrapes Steam playtime data and converts it to the project's JSON format
 * @param {string} apiKey - Your Steam Web API key
 * @param {string} steamId - Your Steam ID
 * @param {string} outputFile - Output file path (default: 'steam-games.json')
 */
async function scrapeSteamData(apiKey, steamId, outputFile = 'steam-games.json') {
    console.log('Starting Steam data scraping...');
    
    try {
        // Step 1: Get owned games with playtime data
        console.log('Fetching owned games from Steam API...');
        const ownedGames = await getOwnedGames(apiKey, steamId);
        
        if (!ownedGames || !ownedGames.games) {
            throw new Error('Failed to fetch owned games or no games found');
        }
        
        console.log(`Found ${ownedGames.games.length} games in your library`);
        
        // Step 2: Get game details for each game (in batches to avoid rate limiting)
        console.log('Fetching game details...');
        const gamesWithDetails = await getGameDetails(ownedGames.games);
        
        // Step 3: Convert to project format
        console.log('Converting to project format...');
        const convertedGames = convertToProjectFormat(gamesWithDetails);
        
        // Step 4: Save to file
        fs.writeFileSync(outputFile, JSON.stringify(convertedGames, null, 2));
        console.log(`Successfully saved ${convertedGames.length} games to ${outputFile}`);
        
        return convertedGames;
        
    } catch (error) {
        console.error('Error scraping Steam data:', error.message);
        throw error;
    }
}

/**
 * Fetches owned games from Steam API
 */
function getOwnedGames(apiKey, steamId) {
    return new Promise((resolve, reject) => {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`;
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData.response);
                } catch (error) {
                    reject(new Error('Failed to parse Steam API response'));
                }
            });
        }).on('error', (error) => {
            reject(new Error(`Steam API request failed: ${error.message}`));
        });
    });
}

/**
 * Fetches detailed game information from Steam store API
 * Uses batching and delays to avoid rate limiting
 */
async function getGameDetails(games) {
    const gamesWithDetails = [];
    const batchSize = 20; // Process games in batches
    const delay = 100; // 0.1 second delay between batches
    
    for (let i = 0; i < games.length; i += batchSize) {
        const batch = games.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(games.length / batchSize)}`);
        
        const batchPromises = batch.map(game => getGameDetail(game));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                gamesWithDetails.push(result.value);
            } else {
                // If we can't get details, use the basic info from the owned games API
                const game = batch[index];
                console.warn(`Failed to get details for ${game.name || game.appid}, using basic info`);
                gamesWithDetails.push({
                    ...game,
                    detailed_name: game.name || `Unknown Game (${game.appid})`
                });
            }
        });
        
        // Add delay between batches to avoid rate limiting
        if (i + batchSize < games.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return gamesWithDetails;
}

/**
 * Fetches detailed information for a single game
 */
function getGameDetail(game) {
    return new Promise((resolve, reject) => {
        const url = `https://store.steampowered.com/api/appdetails?appids=${game.appid}&format=json`;
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    const appData = jsonData[game.appid];
                    
                    if (appData && appData.success && appData.data) {
                        resolve({
                            ...game,
                            detailed_name: appData.data.name,
                            genres: appData.data.genres || [],
                            release_date: appData.data.release_date || {}
                        });
                    } else {
                        // Fallback to basic name if detailed fetch fails
                        resolve({
                            ...game,
                            detailed_name: game.name || `Unknown Game (${game.appid})`
                        });
                    }
                } catch (error) {
                    // Fallback to basic name if parsing fails
                    resolve({
                        ...game,
                        detailed_name: game.name || `Unknown Game (${game.appid})`
                    });
                }
            });
        }).on('error', (error) => {
            // Fallback to basic name if request fails
            resolve({
                ...game,
                detailed_name: game.name || `Unknown Game (${game.appid})`
            });
        });
    });
}

/**
 * Converts Steam API data to the project's JSON format
 */
function convertToProjectFormat(steamGames) {
    return steamGames
        .filter(game => game.playtime_forever > 0) // Only include games with playtime
        .map(game => {
            // Convert playtime from minutes to hours
            const hoursPlayed = Math.round((game.playtime_forever / 60) * 10) / 10;
            
            // Calculate last played date (Steam provides last played as Unix timestamp)
            let lastPlayed = null;
            if (game.rtime_last_played && game.rtime_last_played > 0) {
                const lastPlayedDate = new Date(game.rtime_last_played * 1000);
                lastPlayed = lastPlayedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
            }
            
            return {
                game: game.detailed_name || game.name || `Unknown Game (${game.appid})`,
                platform: "Steam", // All games from Steam
                lastPlayed: lastPlayed,
                hoursPlayed: hoursPlayed,
                appid: game.appid,
                url: `https://store.steampowered.com/app/${game.appid}`
            };
        })
        .sort((a, b) => b.hoursPlayed - a.hoursPlayed); // Sort by playtime descending
}

// Export the main function for use as a module
module.exports = { scrapeSteamData };

// Allow running directly from command line
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node steam-scraper.js <API_KEY> <STEAM_ID> [output_file]');
        console.log('Example: node steam-scraper.js XXXXXXXXXXXXXXXXX YYYYYYYYYYYY steam-games.json');
        process.exit(1);
    }
    
    const [apiKey, steamId, outputFile] = args;
    
    scrapeSteamData(apiKey, steamId, outputFile)
        .then(() => {
            console.log('Steam data scraping completed successfully!');
        })
        .catch((error) => {
            console.error('Steam data scraping failed:', error.message);
            process.exit(1);
        });
} 