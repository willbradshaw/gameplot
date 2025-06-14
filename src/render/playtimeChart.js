// Playtime chart module - scatter plot showing hours played vs rating

import { getPlatformColor, ZOOM_CONFIG } from './config.js';

// Playtime chart configuration
const PLAYTIME_CONFIG = {
    margin: { top: 20, right: 80, bottom: 80, left: 80 },
    width: 1200,
    height: 600,
    get chartWidth() { return this.width - this.margin.left - this.margin.right; },
    get chartHeight() { return this.height - this.margin.top - this.margin.bottom; }
};

let playtimeSvg = null;
let originalXScale = null;
let originalYScale = null;

/**
 * Render the playtime vs rating chart
 * @param {Array} filteredData - Filtered game data
 */
export function renderPlaytimeChart(filteredData) {
    // Clear previous chart
    d3.select("#playtimeChart").selectAll("*").remove();
    
    if (filteredData.length === 0) {
        d3.select("#playtimeChart").append("div")
            .style("text-align", "center")
            .style("color", "#a0a0a0")
            .style("margin-top", "50px")
            .text("No data to display");
        return;
    }

    const { margin, width, height, chartWidth, chartHeight } = PLAYTIME_CONFIG;

    // Create SVG
    playtimeSvg = d3.select("#playtimeChart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const playtimeG = playtimeSvg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add clipping path to constrain points to chart area
    playtimeSvg.append("defs").append("clipPath")
        .attr("id", "playtime-clip")
        .append("rect")
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    // Calculate dynamic domains based on filtered data
    const ratings = filteredData.map(d => d.rating).filter(r => r !== null && r !== undefined);
    const hours = filteredData.map(d => Math.max(d.hoursPlayedTotal, 0.1));
    
    // Create scales with dynamic domains
    const ratingExtent = d3.extent(ratings);
    const ratingPadding = (ratingExtent[1] - ratingExtent[0]) * 0.1; // 10% padding
    const ratingDomain = [
        Math.max(0, ratingExtent[0] - ratingPadding),
        Math.min(10, ratingExtent[1] + ratingPadding)
    ];

    const hoursExtent = d3.extent(hours);
    const hoursDomain = [
        Math.max(0.1, hoursExtent[0] * 0.8), // 20% padding on log scale
        hoursExtent[1] * 1.2
    ];

    const playtimeXScale = d3.scaleLog()
        .domain(hoursDomain)
        .range([0, chartWidth]);

    const playtimeYScale = d3.scaleLinear()
        .domain(ratingDomain)
        .range([chartHeight, 0]);

    // Store original scales for zoom boundary calculations
    originalXScale = playtimeXScale.copy();
    originalYScale = playtimeYScale.copy();

    // Create axes
    const playtimeXAxis = d3.axisBottom(playtimeXScale);
    const playtimeYAxis = d3.axisLeft(playtimeYScale);

    // Add grid lines
    playtimeG.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(playtimeXScale)
            .tickSize(-chartHeight)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    playtimeG.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(playtimeYScale)
            .tickSize(-chartWidth)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    // Add axes
    const playtimeXAxisGroup = playtimeG.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(playtimeXAxis);

    const playtimeYAxisGroup = playtimeG.append("g")
        .attr("class", "axis")
        .call(playtimeYAxis);

    // Add axis labels
    playtimeG.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Rating");

    playtimeG.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text("Hours Played");

    // Calculate proper translate extent based on data bounds
    const padding = 50; // Padding buffer beyond data extents
    
    // Get data range in screen coordinates
    const dataMinX = originalXScale(hoursDomain[0]);
    const dataMaxX = originalXScale(hoursDomain[1]);
    const dataMinY = originalYScale(ratingDomain[1]); // Note: Y scale is inverted
    const dataMaxY = originalYScale(ratingDomain[0]);

    // Add zoom behavior with data-bounded constraints
    const playtimeZoom = d3.zoom()
        .scaleExtent(ZOOM_CONFIG.scaleExtent)
        .extent([[0, 0], [chartWidth, chartHeight]])
        .translateExtent([[dataMinX - padding, dataMinY - padding], 
                         [dataMaxX + padding, dataMaxY + padding]])
        .on("zoom", (event) => handlePlaytimeZoom(event, playtimeXAxisGroup, playtimeYAxisGroup, 
                                                  playtimeG, chartWidth, chartHeight));

    playtimeSvg.call(playtimeZoom);

    // Render data points
    renderPlaytimePoints(filteredData, playtimeG);
}

/**
 * Handle zoom events for the playtime chart
 * @param {Object} event - D3 zoom event
 * @param {Object} xAxisGroup - X axis group selection
 * @param {Object} yAxisGroup - Y axis group selection
 * @param {Object} g - Main chart group
 * @param {number} chartWidth - Chart width
 * @param {number} chartHeight - Chart height
 */
function handlePlaytimeZoom(event, xAxisGroup, yAxisGroup, g, chartWidth, chartHeight) {
    const newXScale = event.transform.rescaleX(originalXScale);
    const newYScale = event.transform.rescaleY(originalYScale);
    
    // Update axes
    xAxisGroup.call(d3.axisBottom(newXScale));
    yAxisGroup.call(d3.axisLeft(newYScale));
    
    // Update points
    g.selectAll(".playtime-circle")
        .attr("cx", d => newXScale(d.hoursPlayedTotal))
        .attr("cy", d => newYScale(d.rating));
    
    // Update grid
    g.select(".grid")
        .call(d3.axisBottom(newXScale)
            .tickSize(-chartHeight)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    g.selectAll(".grid").filter(function(d, i) { return i === 1; })
        .call(d3.axisLeft(newYScale)
            .tickSize(-chartWidth)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");
}

/**
 * Render data points on the playtime chart
 * @param {Array} filteredData - Filtered game data
 * @param {Object} g - Chart group selection
 */
function renderPlaytimePoints(filteredData, g) {
    const circles = g.selectAll(".playtime-circle")
        .data(filteredData, d => d.game);

    circles.exit().remove();

    const circlesEnter = circles.enter()
        .append("circle")
        .attr("class", "playtime-circle")
        .attr("clip-path", "url(#playtime-clip)");

    const circlesUpdate = circlesEnter.merge(circles);

    circlesUpdate
        .attr("cx", d => originalXScale(d.hoursPlayedTotal))
        .attr("cy", d => originalYScale(d.rating))
        .attr("r", 8)
        .attr("fill", d => getPlatformColor(d.platforms[0])) // Use first platform for color
        .attr("stroke", "rgba(255,255,255,0.3)")
        .attr("stroke-width", 1)
        .attr("opacity", 0.8)
        .style("cursor", "pointer") // Add pointer cursor to indicate clickability
        .style("transition", "all 0.2s ease")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .attr("opacity", 1)
                .attr("stroke-width", 3)
                .attr("stroke", "rgba(255,255,255,0.8)")
                .style("filter", "brightness(1.2)");
            
            showPlaytimeTooltip(event, d);
        })
        .on("mousemove", function(event) {
            movePlaytimeTooltip(event);
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("opacity", 0.8)
                .attr("stroke-width", 1)
                .attr("stroke", "rgba(255,255,255,0.3)")
                .style("filter", "brightness(1)");
            hidePlaytimeTooltip();
        })
        .on("click", function(event, d) {
            // Open URL in new tab/window when point is clicked
            if (d.displayUrl) {
                window.open(d.displayUrl, '_blank');
            }
        });
}

/**
 * Show tooltip for playtime chart
 * @param {Object} event - Mouse event
 * @param {Object} d - Game data object
 */
function showPlaytimeTooltip(event, d) {
    const tooltip = d3.select("#tooltip");
    const tagHTML = d.tags.map(tag => `<span class="tooltip-tag">${tag}</span>`).join('');
    const platformsText = d.platforms.join(', ');
    
    tooltip
        .style("display", "block")
        .html(`
            <div class="tooltip-title">${d.game}</div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Rating:</span>
                <span>${d.rating}/10</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Platform${d.platforms.length > 1 ? 's' : ''}:</span>
                <span>${platformsText}</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Status:</span>
                <span>${d.status}</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Hours Played:</span>
                <span>${d.hoursPlayedTotal.toFixed(1)}</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Last Played:</span>
                <span>${new Date(d.lastPlayedTotal).toISOString().split('T')[0]}</span>
            </div>
            <div class="tooltip-tags">${tagHTML}</div>
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px");
}

/**
 * Move tooltip to follow mouse
 * @param {Object} event - Mouse event
 */
function movePlaytimeTooltip(event) {
    d3.select("#tooltip")
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px");
}

/**
 * Hide tooltip
 */
function hidePlaytimeTooltip() {
    d3.select("#tooltip").style("display", "none");
} 