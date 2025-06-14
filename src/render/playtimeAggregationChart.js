// Playtime aggregation chart module - bar chart showing total playtime by different categories

import { getPlatformColor } from './config.js';

// Chart configuration
const AGGREGATION_CONFIG = {
    margin: { top: 20, right: 80, bottom: 100, left: 80 },
    width: 1200,
    height: 500,
    get chartWidth() { return this.width - this.margin.left - this.margin.right; },
    get chartHeight() { return this.height - this.margin.top - this.margin.bottom; }
};

let currentAggregationType = 'platform';
let currentData = [];

/**
 * Initialize the playtime aggregation chart
 * @param {Array} data - Game data
 */
export function initializePlaytimeAggregation(data) {
    currentData = data;
    setupAggregationControls();
    renderPlaytimeAggregation(data);
}

/**
 * Update the playtime aggregation chart with new data
 * @param {Array} filteredData - Filtered game data
 */
export function updatePlaytimeAggregation(filteredData) {
    currentData = filteredData;
    renderPlaytimeAggregation(filteredData);
}

/**
 * Set up the aggregation type control buttons
 */
function setupAggregationControls() {
    const controlsContainer = d3.select("#playtimeAggregationControls");
    
    const buttons = [
        { id: 'platform', label: 'Platform', icon: '🖥️' },
        { id: 'tag', label: 'Tag', icon: '🏷️' },
        { id: 'status', label: 'Status', icon: '📊' },
        { id: 'rating', label: 'Rating', icon: '⭐' }
    ];
    
    buttons.forEach(button => {
        controlsContainer.append("button")
            .attr("class", `aggregation-btn ${button.id === currentAggregationType ? 'active' : ''}`)
            .attr("data-type", button.id)
            .html(`${button.icon} ${button.label}`)
            .on("click", () => {
                currentAggregationType = button.id;
                updateActiveButton(button.id);
                renderPlaytimeAggregation(currentData);
            });
    });
}

/**
 * Update the active button styling
 * @param {string} activeType - The active aggregation type
 */
function updateActiveButton(activeType) {
    d3.selectAll(".aggregation-btn")
        .classed("active", false);
    d3.select(`.aggregation-btn[data-type="${activeType}"]`)
        .classed("active", true);
}

/**
 * Render the playtime aggregation chart
 * @param {Array} filteredData - Filtered game data
 */
function renderPlaytimeAggregation(filteredData) {
    // Clear previous chart
    d3.select("#playtimeAggregationChart").selectAll("*").remove();
    
    if (filteredData.length === 0) {
        d3.select("#playtimeAggregationChart").append("div")
            .style("text-align", "center")
            .style("color", "#a0a0a0")
            .style("margin-top", "50px")
            .text("No data to display");
        return;
    }

    const { margin, width, height, chartWidth, chartHeight } = AGGREGATION_CONFIG;

    // Aggregate data based on current type
    const aggregatedData = aggregatePlaytimeData(filteredData, currentAggregationType);
    
    // Sort data based on aggregation type
    if (currentAggregationType === 'rating') {
        // For rating view, sort by rating order (9-10 first)
        const ratingOrder = ['9-10', '8-9', '7-8', '6-7', '5-6', '<5', 'No Rating'];
        aggregatedData.sort((a, b) => {
            const aIndex = ratingOrder.indexOf(a.category);
            const bIndex = ratingOrder.indexOf(b.category);
            return aIndex - bIndex;
        });
    } else {
        // For other views, sort by total playtime descending
        aggregatedData.sort((a, b) => b.totalHours - a.totalHours);
    }

    // Create SVG
    const svg = d3.select("#playtimeAggregationChart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleBand()
        .domain(aggregatedData.map(d => d.category))
        .range([0, chartWidth])
        .padding(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(aggregatedData, d => d.totalHours) * 1.1])
        .range([chartHeight, 0]);

    // Create axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    // Add grid lines
    g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xScale)
            .tickSize(-chartHeight)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale)
            .tickSize(-chartWidth)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    // Add axes
    g.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(xAxis)
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

    g.append("g")
        .attr("class", "axis")
        .call(yAxis);

    // Add axis labels
    g.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Total Hours Played");

    g.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text(getAxisLabel(currentAggregationType));

    // Create bars
    const bars = g.selectAll(".aggregation-bar")
        .data(aggregatedData)
        .enter()
        .append("rect")
        .attr("class", "aggregation-bar")
        .attr("x", d => xScale(d.category))
        .attr("width", xScale.bandwidth())
        .attr("y", chartHeight)
        .attr("height", 0)
        .attr("fill", d => getBarColor(d.category, currentAggregationType))
        .attr("stroke", "rgba(255,255,255,0.2)")
        .attr("stroke-width", 1)
        .style("cursor", "pointer");

    // Animate bars
    bars.transition()
        .duration(800)
        .attr("y", d => yScale(d.totalHours))
        .attr("height", d => chartHeight - yScale(d.totalHours));

    // Add value labels on bars
    g.selectAll(".bar-label")
        .data(aggregatedData)
        .enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", d => xScale(d.category) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(d.totalHours) - 5)
        .attr("text-anchor", "middle")
        .style("fill", "#ffffff")
        .style("font-size", "12px")
        .style("font-weight", "500")
        .text(d => `${Math.round(d.totalHours)}h`)
        .style("opacity", 0)
        .transition()
        .delay(400)
        .duration(400)
        .style("opacity", 1);

    // Add tooltips and click handlers
    bars.on("mouseover", function(event, d) {
            showAggregationTooltip(event, d, filteredData);
        })
        .on("mousemove", moveAggregationTooltip)
        .on("mouseout", hideAggregationTooltip)
        .on("click", function(event, d) {
            handleBarClick(d.category, currentAggregationType);
        });
}

/**
 * Aggregate playtime data by the specified type
 * @param {Array} data - Game data
 * @param {string} type - Aggregation type (platform, tag, status, rating)
 * @returns {Array} Aggregated data
 */
function aggregatePlaytimeData(data, type) {
    const aggregation = {};

    data.forEach(game => {
        let categories = [];

        switch (type) {
            case 'platform':
                // For platforms, use the actual hours played on each platform
                const platforms = game.platforms || [];
                const hoursPerPlatform = game.hoursPlayedSingle || [];
                
                platforms.forEach((platform, index) => {
                    // Convert to number to handle string values in data
                    const hours = parseFloat(hoursPerPlatform[index]) || 0;
                    if (!aggregation[platform]) {
                        aggregation[platform] = {
                            category: platform,
                            totalHours: 0,
                            gameCount: 0
                        };
                    }
                    aggregation[platform].totalHours += hours;
                    aggregation[platform].gameCount += 1;
                });
                return; // Skip the general category processing below
                
            case 'tag':
                // For tags, we do want to count games multiple times if they have multiple tags
                // This shows which tags accumulate the most total playtime
                categories = game.tags || [];
                break;
            case 'status':
                categories = [game.status || 'Unknown'];
                break;
            case 'rating':
                categories = [getRatingRange(game.rating)];
                break;
        }

        // For non-platform aggregations, use total hours (convert to number)
        const hours = parseFloat(game.hoursPlayedTotal) || 0;
        categories.forEach(category => {
            if (!aggregation[category]) {
                aggregation[category] = {
                    category: category,
                    totalHours: 0,
                    gameCount: 0
                };
            }
            aggregation[category].totalHours += hours;
            aggregation[category].gameCount += 1;
        });
    });

    // Filter out categories with zero hours
    const result = Object.values(aggregation).filter(d => d.totalHours > 0);
    
    return result;
}

/**
 * Get rating range for a numeric rating
 * @param {number} rating - Numeric rating
 * @returns {string} Rating range string
 */
function getRatingRange(rating) {
    if (rating === null || rating === undefined) return 'No Rating';
    if (rating >= 9.0) return '9-10';
    if (rating >= 8.0) return '8-9';
    if (rating >= 7.0) return '7-8';
    if (rating >= 6.0) return '6-7';
    if (rating >= 5.0) return '5-6';
    return '<5';
}

/**
 * Get appropriate axis label for aggregation type
 * @param {string} type - Aggregation type
 * @returns {string} Axis label
 */
function getAxisLabel(type) {
    switch (type) {
        case 'platform': return 'Platform';
        case 'tag': return 'Tag';
        case 'status': return 'Status';
        case 'rating': return 'Rating Range';
        default: return 'Category';
    }
}

/**
 * Get appropriate color for bars based on category and type
 * @param {string} category - Category name
 * @param {string} type - Aggregation type
 * @returns {string} Color
 */
function getBarColor(category, type) {
    switch (type) {
        case 'platform':
            return getPlatformColor(category);
        case 'status':
            return getStatusColor(category);
        case 'rating':
            return getRatingColor(category);
        case 'tag':
        default:
            return '#3b82f6'; // Default blue
    }
}

/**
 * Get color for status categories
 * @param {string} status - Status name
 * @returns {string} Color
 */
function getStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'complete': return '#10b981';
        case 'playing': return '#3b82f6';
        case 'abandoned': return '#ef4444';
        case 'unplayed': return '#9ca3af';
        default: return '#9ca3af';
    }
}

/**
 * Get color for rating ranges
 * @param {string} range - Rating range
 * @returns {string} Color
 */
function getRatingColor(range) {
    switch (range) {
        case '9-10': return '#3b82f6';      // blue
        case '8-9': return '#06b6d4';       // blue-green
        case '7-8': return '#84cc16';       // yellow-green
        case '6-7': return '#eab308';       // yellow
        case '5-6': return '#f97316';       // orange
        case '<5': return '#ef4444';        // red
        default: return '#9ca3af';          // gray
    }
}

/**
 * Show tooltip for aggregation bars
 * @param {Event} event - Mouse event
 * @param {Object} d - Data object
 * @param {Array} filteredData - The filtered game data
 */
function showAggregationTooltip(event, d, filteredData) {
    // Calculate average rating for this category
    let gamesInCategory = [];
    
    switch (currentAggregationType) {
        case 'platform':
            gamesInCategory = filteredData.filter(game => 
                game.platforms && game.platforms.includes(d.category)
            );
            break;
        case 'tag':
            gamesInCategory = filteredData.filter(game => 
                game.tags && game.tags.includes(d.category)
            );
            break;
        case 'status':
            gamesInCategory = filteredData.filter(game => 
                (game.status || 'Unknown') === d.category
            );
            break;
        case 'rating':
            gamesInCategory = filteredData.filter(game => 
                getRatingRange(game.rating) === d.category
            );
            break;
    }
    
    // Calculate average rating
    const gamesWithRatings = gamesInCategory.filter(game => 
        game.rating !== null && game.rating !== undefined
    );
    const avgRating = gamesWithRatings.length > 0 
        ? gamesWithRatings.reduce((sum, game) => sum + game.rating, 0) / gamesWithRatings.length
        : null;
    
    // Use consistent tooltip display method
    const tooltip = d3.select("#tooltip");
    
    let tooltipContent = `
        <div class="tooltip-title">${d.category}</div>
        <div class="tooltip-content">
            <div><strong>Total Hours:</strong> ${Math.round(d.totalHours * 10) / 10}h</div>
            <div><strong>Games:</strong> ${d.gameCount}</div>
            <div><strong>Avg Hours/Game:</strong> ${Math.round((d.totalHours / d.gameCount) * 10) / 10}h</div>`;
    
    if (avgRating !== null) {
        tooltipContent += `<div><strong>Avg Rating:</strong> ${avgRating.toFixed(1)}</div>`;
    }
    
    tooltipContent += `</div>`;
    
    tooltip.style("display", "block")
        .html(tooltipContent)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px");
}

/**
 * Move tooltip with mouse
 * @param {Event} event - Mouse event
 */
function moveAggregationTooltip(event) {
    const tooltip = d3.select("#tooltip");
    if (tooltip.style("display") === "block") {
        tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
    }
}

/**
 * Hide tooltip
 */
function hideAggregationTooltip() {
    d3.select("#tooltip").style("display", "none");
}

/**
 * Handle bar click
 * @param {string} category - Category name
 * @param {string} type - Aggregation type
 */
function handleBarClick(category, type) {
    // Get the appropriate filter function from gamesTable.js
    switch (type) {
        case 'platform':
            if (window.filterByPlatform) {
                window.filterByPlatform(category);
            }
            break;
        case 'tag':
            if (window.filterByTag) {
                window.filterByTag(category);
            }
            break;
        case 'status':
            if (window.filterByStatus) {
                window.filterByStatus(category);
            }
            break;
        case 'rating':
            if (window.filterByRating) {
                window.filterByRating(category);
            }
            break;
    }
    
    // Scroll to the table to show the filtered results
    const tableContainer = document.getElementById('gamesTableContainer');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth' });
    }
} 