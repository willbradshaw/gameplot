const { 
    exchangeNpssoForAccessCode, 
    exchangeAccessCodeForAuthTokens,
    getUserPlayedGames 
} = require('psn-api');
const fs = require('fs');

// Dynamic import for the 'open' package (ES Module)
let open;
async function loadOpenPackage() {
    try {
        const openModule = await import('open');
        open = openModule.default;
        console.log('✓ Open package loaded successfully');
        return true;
    } catch (error) {
        console.log('✗ Failed to load open package:', error.message);
        return false;
    }
}

/**
 * Scrapes PSN (PlayStation Network) playtime data and converts it to the project's JSON format
 * @param {string} npsso - Your PSN NPSSO token (obtained from https://ca.account.sony.com/api/v1/ssocookie)
 * @param {string} accountId - PSN account ID ("me" for your own account)
 * @param {string} outputFile - Output file path (default: 'psn-games.json')
 * @param {number} response_limit - Maximum number of games to fetch (default: 500)
 */
async function scrapePsnData(npsso, accountId = 'me', outputFile = 'data/games-raw/psn-games-us.json', response_limit = 200) {
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

/**
 * Automated authentication flow for PSN
 * Opens browser windows for login and guides user through NPSSO token extraction
 * @param {string} outputFile - Output file path for scraped data
 * @param {string} accountId - PSN account ID ("me" for your own account)
 * @param {number} responseLimit - Maximum number of games to fetch
 */
async function automatedAuth(outputFile = 'data/games-raw/psn-games-us.json', accountId = 'me', responseLimit = 200) {
    console.log('Starting PSN automated authentication...');
    
    const openLoaded = await loadOpenPackage();
    
    // Step 1: Open PlayStation login page
    const loginUrl = 'https://www.playstation.com/';
    console.log('\nStep 1: Logging into PlayStation Network');
    
    if (openLoaded && open) {
        try {
            await open(loginUrl);
            console.log('✓ Browser opened to PlayStation login page');
        } catch (error) {
            console.log('Please manually open this URL to log in:');
            console.log(loginUrl);
        }
    } else {
        console.log('Please open this URL in your browser to log in:');
        console.log(loginUrl);
    }
    
    console.log('\n1. Please log into your PlayStation account in the browser');
    console.log('2. Once logged in, press Enter to continue...');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve, reject) => {
        rl.question('Press Enter after logging in...', async () => {
            // Step 2: Open NPSSO cookie page
            const npssoUrl = 'https://ca.account.sony.com/api/v1/ssocookie';
            console.log('\nStep 2: Getting your NPSSO token');
            
            if (openLoaded && open) {
                try {
                    await open(npssoUrl);
                    console.log('✓ Browser opened to NPSSO cookie page');
                } catch (error) {
                    console.log('Please manually open this URL:');
                    console.log(npssoUrl);
                }
            } else {
                console.log('Please open this URL in your browser:');
                console.log(npssoUrl);
            }
            
            console.log('\nYou should see a JSON response. Copy the "npsso" value (a 64-character string).');
            console.log('Example: "npsso": "abcd1234efgh5678..."');
            console.log('\nIMPORTANT: Keep your NPSSO token private - it\'s equivalent to your password!');
            
            rl.question('\nPaste your NPSSO token here: ', (npssoToken) => {
                rl.close();
                
                if (!npssoToken || npssoToken.trim().length === 0) {
                    reject(new Error('No NPSSO token provided'));
                    return;
                }
                
                const cleanToken = npssoToken.trim().replace(/"/g, ''); // Remove quotes if present
                
                if (cleanToken.length !== 64) {
                    reject(new Error('Invalid NPSSO token length. Expected 64 characters.'));
                    return;
                }
                
                console.log('✓ NPSSO token received, starting data scraping...');
                
                scrapePsnData(cleanToken, accountId, outputFile, responseLimit)
                    .then(() => {
                        console.log('✓ PSN data scraping completed successfully!');
                        resolve();
                    })
                    .catch(reject);
            });
        });
    });
}

// Export the main functions for use as a module
module.exports = { scrapePsnData, automatedAuth };

// Allow running directly from command line
if (require.main === module) {
    const args = process.argv.slice(2);
    
    // Show help
    if (args.includes('--help') || args.includes('-h')) {
        console.log('PSN Game Data Scraper');
        console.log('');
        console.log('Usage:');
        console.log('  node psn-scraper.js [output_file] [account_id] [response_limit]');
        console.log('');
        console.log('Options:');
        console.log('  [output_file]     Output file path (default: "data/games-raw/psn-games-us.json")');
        console.log('  [account_id]      PSN account ID (default: "me")');
        console.log('  [response_limit]  Max games to fetch (default: 200)');
        console.log('');
        console.log('Examples:');
        console.log('  node psn-scraper.js');
        console.log('  node psn-scraper.js my-games.json');
        console.log('  node psn-scraper.js my-games.json me 500');
        console.log('');
        console.log('This will guide you through:');
        console.log('1. Logging into https://www.playstation.com/');
        console.log('2. Getting your NPSSO token from https://ca.account.sony.com/api/v1/ssocookie');
        console.log('');
        console.log('Note: NPSSO tokens are temporary and expire frequently, so manual token');
        console.log('input is not supported. The automated flow ensures fresh authentication.');
        process.exit(0);
    }
    
    // Parse arguments for automated authentication
    const [outputFile, accountId, responseLimit] = args;
    const finalOutputFile = outputFile || 'data/games-raw/psn-games-us.json';
    const finalAccountId = accountId || 'me';
    const finalLimit = responseLimit ? parseInt(responseLimit, 10) : 200;
    
    console.log('Starting automated PSN authentication...');
    console.log('Use --help for options.');
    console.log('');
    
    automatedAuth(finalOutputFile, finalAccountId, finalLimit)
        .catch((error) => {
            console.error('PSN authentication failed:', error.message);
            process.exit(1);
        });
} 