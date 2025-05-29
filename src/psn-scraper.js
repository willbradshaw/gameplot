const { 
    exchangeNpssoForAccessCode, 
    exchangeAccessCodeForAuthTokens,
    getUserPlayedGames 
} = require('psn-api');
const fs = require('fs');

/**
 * Scrapes PSN (PlayStation Network) playtime data and converts it to the project's JSON format
 * @param {string} npsso - Your PSN NPSSO token (obtained from https://ca.account.sony.com/api/v1/ssocookie)
 * @param {string} accountId - PSN account ID ("me" for your own account)
 * @param {string} outputFile - Output file path (default: 'psn-games.json')
 * @param {number} response_limit - Maximum number of games to fetch (default: 500)
 */
async function scrapePsnData(npsso, accountId = 'me', outputFile = 'psn-games.json', response_limit = 200) {
    console.log('Starting PSN data scraping...');
    try {
        // Step 1: Authenticate with PSN using NPSSO token
        console.log('Authenticating with PlayStation Network...');
        const accessCode = await exchangeNpssoForAccessCode(npsso);
        const authorization = await exchangeAccessCodeForAuthTokens(accessCode);
        console.log('Authentication successful!');
        // Step 2: Get played games data
        console.log('Fetching played games from PSN API...');
        const playedGamesResponse = await getUserPlayedGames(authorization, accountId, {
            limit: response_limit,
        });
        if (!playedGamesResponse) {
            throw new Error('Failed to fetch played games');
        }
        if (!playedGamesResponse.titles) {
            throw new Error('No titles found in response');
        }
        console.log(`Found ${playedGamesResponse.titles.length} games in your library`);
        // Step 3: Convert to project format
        console.log('Converting to project format...');
        const convertedGames = convertToProjectFormat(playedGamesResponse.titles);
        // Step 4: Save to file
        fs.writeFileSync(outputFile, JSON.stringify(convertedGames, null, 2));
        console.log(`Successfully saved ${convertedGames.length} games to ${outputFile}`);
        return convertedGames;
    } catch (error) {
        console.error('Error scraping PSN data:', error.message);
        throw error;
    }
}

/**
 * Converts PSN API data to the project's JSON format (matching Steam format)
 * @param {Array} psnGames - Array of PSN games
 * @returns {Array} Array of games in the project's JSON format
 */
function convertToProjectFormat(psnGames) {
    // Use a Map to track games by ID and handle duplicates
    const gamesMap = new Map();
    psnGames
        .filter(game => game.playDuration && game.playDuration !== 'PT0S') // Only include games with playtime
        .forEach(game => {
            // Parse ISO 8601 duration format (PT228H56M33S) to hours
            const hoursPlayed = parseDurationToHours(game.playDuration);
            // Parse last played date from ISO format
            let lastPlayed = null;
            if (game.lastPlayedDateTime) {
                const lastPlayedDate = new Date(game.lastPlayedDateTime);
                lastPlayed = lastPlayedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
            }
            // Extract concept ID if present, otherwise use titleId
            const id = game.concept?.id || game.titleId;
            // Generate PlayStation Store URL if we have concept ID
            let url = null;
            if (game.concept && game.concept.id) {
                url = `https://store.playstation.com/concept/${game.concept.id}`;
            }
            const gameData = {
                game: game.localizedName || game.name || `Unknown Game (${id})`,
                platform: "PS5", // Simplified since user only uses PS5
                lastPlayed: lastPlayed,
                hoursPlayed: hoursPlayed,
                id: id,
                url: url
            };
            // Check if we already have this game (by ID)
            if (gamesMap.has(id)) {
                const existingGame = gamesMap.get(id);
                console.log(`Found duplicate game: ${gameData.game} (ID: ${id})`);
                // Assert that game names match for the same ID
                if (existingGame.game !== gameData.game) {
                    throw new Error(`Game name mismatch for ID ${id}: "${existingGame.game}" vs "${gameData.game}"`);
                }
                // Update lastPlayed to the most recent date
                if (lastPlayed && (!existingGame.lastPlayed || lastPlayed > existingGame.lastPlayed)) {
                    existingGame.lastPlayed = lastPlayed;
                    console.log(`  Updated lastPlayed to: ${lastPlayed}`);
                }
                // Update hoursPlayed to the sum of the two entries
                const newHoursPlayed = Math.round((existingGame.hoursPlayed + hoursPlayed) * 10) / 10;
                console.log(`  Summed hoursPlayed: ${existingGame.hoursPlayed} + ${hoursPlayed} = ${newHoursPlayed} hours`);
                existingGame.hoursPlayed = newHoursPlayed;
            } else {
                // First time seeing this game, add it to the map
                gamesMap.set(id, gameData);
            }
        });
    // Convert Map back to array and sort by playtime descending
    return Array.from(gamesMap.values())
        .sort((a, b) => b.hoursPlayed - a.hoursPlayed);
}

/**
 * Parses ISO 8601 duration format (PT228H56M33S) to decimal hours
 * @param {string} duration - ISO 8601 duration string
 * @returns {number} Hours as decimal number
 */
function parseDurationToHours(duration) {
    if (!duration || duration === 'PT0S') {
        return 0;
    }
    // Parse PT228H56M33S format
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) {
        console.warn(`Could not parse duration: ${duration}`);
        return 0;
    }
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseFloat(match[3] || '0');
    // Convert everything to hours with one decimal place
    const totalHours = hours + (minutes / 60) + (seconds / 3600);
    return Math.round(totalHours * 10) / 10;
}

// Export the main function for use as a module
module.exports = { scrapePsnData };

// Allow running directly from command line
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: node psn-scraper.js <NPSSO_TOKEN> [account_id] [output_file]');
        console.log('Example: node psn-scraper.js "YOUR_64_CHAR_NPSSO_TOKEN" me psn-games.json');
        console.log('');
        console.log('To get your NPSSO token:');
        console.log('1. Sign in to https://www.playstation.com/');
        console.log('2. Visit https://ca.account.sony.com/api/v1/ssocookie');
        console.log('3. Copy the "npsso" value from the JSON response');
        console.log('');
        console.log('IMPORTANT: Keep your NPSSO token private - it\'s equivalent to your password!');
        process.exit(1);
    }
    
    const [npsso, accountId, outputFile, responseLimit] = args;
    const limit = responseLimit ? parseInt(responseLimit, 10) : 200;
    
    scrapePsnData(npsso, accountId, outputFile, limit)
        .then(() => {
            console.log('PSN data scraping completed successfully!');
        })
        .catch((error) => {
            console.error('PSN data scraping failed:', error.message);
            process.exit(1);
        });
} 