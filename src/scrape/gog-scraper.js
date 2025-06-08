const https = require('https');
const fs = require('fs');
const http = require('http');
const { URL } = require('url');

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
 * Scrapes GOG library data and converts it to the project's JSON format
 */
async function scrapeGOGData(accessToken, outputFile = 'data/gog-games.json') {
    console.log('Starting GOG data scraping...');
    
    try {
        // Get user data to verify authentication
        const userData = await getUserData(accessToken);
        if (!userData || !userData.isLoggedIn) {
            throw new Error('Authentication failed - invalid or expired access token');
        }
        console.log(`Authenticated as: ${userData.username}`);
        
        // Get owned games list
        const ownedGames = await getOwnedGames(accessToken);
        if (!ownedGames || !ownedGames.owned || ownedGames.owned.length === 0) {
            throw new Error('No games found in library');
        }
        console.log(`Found ${ownedGames.owned.length} games in your library`);
        
        // Get detailed information for each game
        const gamesWithDetails = await getGameDetails(ownedGames.owned, accessToken);
        
        // Convert to project format
        const convertedGames = convertToProjectFormat(gamesWithDetails);
        
        // Save to file
        fs.writeFileSync(outputFile, JSON.stringify(convertedGames, null, 2));
        console.log(`Successfully saved ${convertedGames.length} games to ${outputFile}`);
        
        return convertedGames;
        
    } catch (error) {
        console.error('Error scraping GOG data:', error.message);
        throw error;
    }
}

function getUserData(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'GOG-Scraper/1.0'
            }
        };
        
        https.get('https://embed.gog.com/userData.json', options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error('Failed to parse user data response'));
                }
            });
        }).on('error', (error) => {
            reject(new Error(`User data request failed: ${error.message}`));
        });
    });
}

function getOwnedGames(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'GOG-Scraper/1.0'
            }
        };
        
        https.get('https://embed.gog.com/user/data/games', options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error('Failed to parse owned games response'));
                }
            });
        }).on('error', (error) => {
            reject(new Error(`Owned games request failed: ${error.message}`));
        });
    });
}

async function getGameDetails(gameIds, accessToken) {
    const gamesWithDetails = [];
    const batchSize = 100;
    const delay = 100;
    
    for (let i = 0; i < gameIds.length; i += batchSize) {
        const batch = gameIds.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gameIds.length / batchSize)}`);
        
        const batchPromises = batch.map(gameId => getGameDetail(gameId, accessToken));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                gamesWithDetails.push(result.value);
            } else {
                const gameId = batch[index];
                console.warn(`Failed to get details for game ID ${gameId}`);
                gamesWithDetails.push({
                    id: gameId,
                    title: `Unknown Game (${gameId})`
                });
            }
        });
        
        if (i + batchSize < gameIds.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return gamesWithDetails;
}

function getGameDetail(gameId, accessToken) {
    return new Promise((resolve) => {
        const options = {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'GOG-Scraper/1.0'
            }
        };
        
        https.get(`https://embed.gog.com/account/gameDetails/${gameId}.json`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ ...jsonData, id: gameId });
                } catch (error) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

function convertToProjectFormat(gogGames) {
    const gamesMap = new Map();
    
    gogGames
        .filter(game => game && game.title)
        .forEach(game => {
            const gameData = {
                game: game.title,
                platform: "GOG",
                lastPlayed: null,
                hoursPlayed: null,
                id: game.id,
                url: `https://gogdb.org/product/${game.id}`
            };
            
            if (gamesMap.has(game.id)) {
                const existingGame = gamesMap.get(game.id);
                if (gameData.game.length > existingGame.game.length) {
                    existingGame.game = gameData.game;
                }
            } else {
                gamesMap.set(game.id, gameData);
            }
        });
    
    return Array.from(gamesMap.values())
        .sort((a, b) => a.game.localeCompare(b.game));
}

function exchangeCodeForToken(authCode) {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            client_id: '46899977096215655',
            client_secret: '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9',
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: 'https://embed.gog.com/on_login_success?origin=client'
        }).toString();

        const options = {
            hostname: 'auth.gog.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'GOG-Scraper/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.access_token) {
                        resolve(jsonData.access_token);
                    } else {
                        reject(new Error(`Token exchange failed: ${jsonData.error || 'Unknown error'}`));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse token response'));
                }
            });
        });

        req.on('error', (error) => reject(new Error(`Token request failed: ${error.message}`)));
        req.write(postData);
        req.end();
    });
}

async function automatedAuth(outputFile) {
    const authUrl = `https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2`;
    
    console.log('Starting GOG authentication...');
    
    const openLoaded = await loadOpenPackage();
    
    if (openLoaded && open) {
        try {
            await open(authUrl);
            console.log('✓ Browser opened successfully');
        } catch (error) {
            console.log('Please manually open this URL:');
            console.log(authUrl);
        }
    } else {
        console.log('Please open this URL in your browser:');
        console.log(authUrl);
    }
    
    console.log('\nAfter logging in, copy the "code" from the redirect URL and paste it below:');
    console.log('URL format: https://embed.gog.com/on_login_success?origin=client&code=XXXXXXX');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve, reject) => {
        rl.question('Authorization code: ', (authCode) => {
            rl.close();
            
            if (!authCode || authCode.trim().length === 0) {
                reject(new Error('No authorization code provided'));
                return;
            }
            
            console.log('Exchanging code for access token...');
            
            exchangeCodeForToken(authCode.trim())
                .then((accessToken) => {
                    console.log('✓ Access token obtained');
                    return scrapeGOGData(accessToken, outputFile);
                })
                .then(() => {
                    console.log('✓ GOG data scraping completed');
                    console.log('\nNote: GOG API does not provide playtime data.');
                    resolve();
                })
                .catch(reject);
        });
    });
}

module.exports = { scrapeGOGData, automatedAuth };

// Command line usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Usage: node gog-scraper.js [output_file]');
        console.log('Default output: data/gog-games.json');
        process.exit(0);
    }
    
    const outputFile = args[0] || 'data/gog-games.json';
    
    automatedAuth(outputFile)
        .catch((error) => {
            console.error('Failed:', error.message);
            process.exit(1);
        });
} 