// Statistics module - handles calculation and display of summary statistics

/**
 * Update and display statistics based on filtered data
 * @param {Array} filteredData - Filtered game data
 */
export function updateStats(filteredData) {
    const avgRating = filteredData.length > 0 ? d3.mean(filteredData, d => d.rating).toFixed(1) : 0;
    const totalHours = d3.sum(filteredData, d => d.hoursPlayedTotal).toFixed(1);
    const gamesCount = filteredData.length;
    const topRated = filteredData.length > 0 ? filteredData.reduce((a, b) => a.rating > b.rating ? a : b) : null;

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
            <div class="stat-value">${topRated ? topRated.rating : 'N/A'}</div>
            <div class="stat-label">Highest Rated${topRated ? `: ${topRated.game}` : ''}</div>
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