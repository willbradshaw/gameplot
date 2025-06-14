// Statistics module - handles calculation and display of summary statistics

// Cache for last updated data
let lastUpdatedData = null;

/**
 * Load last updated data from JSON file
 * @returns {Promise<Object>} Last updated data
 */
async function loadLastUpdated() {
    if (lastUpdatedData) {
        return lastUpdatedData;
    }
    
    try {
        const response = await fetch('data/last-updated.json');
        lastUpdatedData = await response.json();
        return lastUpdatedData;
    } catch (error) {
        console.error('Error loading last updated data:', error);
        return { lastUpdated: null };
    }
}

/**
 * Format the last updated date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
function formatLastUpdated(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        // Return ISO date format (yyyy-mm-dd)
        return date.toISOString().split('T')[0];
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Unknown';
    }
}

/**
 * Update and display statistics based on filtered data
 * @param {Array} filteredData - Filtered game data
 */
export async function updateStats(filteredData) {
    const avgRating = filteredData.length > 0 ? d3.mean(filteredData, d => d.rating).toFixed(1) : 0;
    const totalHours = d3.sum(filteredData, d => d.hoursPlayedTotal).toFixed(1);
    const gamesCount = filteredData.length;
    
    // Load last updated data
    const lastUpdated = await loadLastUpdated();
    const formattedDate = formatLastUpdated(lastUpdated.lastUpdated);

    d3.select("#stats").html(`
        <div class="stat-card">
            <div class="stat-value">${gamesCount}</div>
            <div class="stat-label">Games Played</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avgRating}</div>
            <div class="stat-label">Average Rating</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalHours}</div>
            <div class="stat-label">Total Hours</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formattedDate}</div>
            <div class="stat-label">Last Updated</div>
        </div>
    `);
}

/**
 * Calculate additional statistics for analysis
 * @param {Array} data - Game data array
 * @returns {Object} Statistics object
 */
export function calculateDetailedStats(data) {
    if (data.length === 0) {
        return {
            count: 0,
            avgRating: 0,
            medianRating: 0,
            totalHours: 0,
            avgHours: 0,
            topRated: null,
            mostPlayed: null,
            platformBreakdown: {},
            statusBreakdown: {}
        };
    }

    const ratings = data.map(d => d.rating);
    const hours = data.map(d => d.hoursPlayedTotal);
    
    // Platform breakdown - handle platforms array
    const platformBreakdown = {};
    data.forEach(d => {
        d.platforms.forEach(platform => {
            platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;
        });
    });

    // Status breakdown
    const statusBreakdown = {};
    data.forEach(d => {
        statusBreakdown[d.status] = (statusBreakdown[d.status] || 0) + 1;
    });

    return {
        count: data.length,
        avgRating: d3.mean(ratings),
        medianRating: d3.median(ratings),
        totalHours: d3.sum(hours),
        avgHours: d3.mean(hours),
        topRated: data.reduce((a, b) => a.rating > b.rating ? a : b),
        mostPlayed: data.reduce((a, b) => a.hoursPlayedTotal > b.hoursPlayedTotal ? a : b),
        platformBreakdown,
        statusBreakdown
    };
} 