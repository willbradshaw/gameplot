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

    // Create scales
    const playtimeXScale = d3.scaleLinear()
        .domain([0, d3.max(filteredData, d => d.hoursPlayed) * 1.1])
        .range([0, chartWidth]);

    const playtimeYScale = d3.scaleLinear()
        .domain([0, 10])
        .range([chartHeight, 0]);

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
        .text("Rating (0-10)");

    playtimeG.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text("Hours Played");

    // Add zoom behavior
    const playtimeZoom = d3.zoom()
        .scaleExtent(ZOOM_CONFIG.scaleExtent)
        .extent([[0, 0], [chartWidth, chartHeight]])
        .on("zoom", (event) => handlePlaytimeZoom(event, playtimeXScale, playtimeYScale, 
                                                  playtimeXAxisGroup, playtimeYAxisGroup, 
                                                  playtimeG, chartWidth, chartHeight));

    playtimeSvg.call(playtimeZoom);

    // Render data points
    renderPlaytimePoints(filteredData, playtimeG, playtimeXScale, playtimeYScale);
}

/**
 * Handle zoom events for the playtime chart
 * @param {Object} event - D3 zoom event
 * @param {Function} xScale - Original X scale
 * @param {Function} yScale - Original Y scale
 * @param {Object} xAxisGroup - X axis group selection
 * @param {Object} yAxisGroup - Y axis group selection
 * @param {Object} g - Main chart group
 * @param {number} chartWidth - Chart width
 * @param {number} chartHeight - Chart height
 */
function handlePlaytimeZoom(event, xScale, yScale, xAxisGroup, yAxisGroup, g, chartWidth, chartHeight) {
    const newXScale = event.transform.rescaleX(xScale);
    const newYScale = event.transform.rescaleY(yScale);
    
    // Update axes
    xAxisGroup.call(d3.axisBottom(newXScale));
    yAxisGroup.call(d3.axisLeft(newYScale));
    
    // Update points
    g.selectAll(".playtime-circle")
        .attr("cx", d => newXScale(d.hoursPlayed))
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
 * @param {Function} xScale - X scale function
 * @param {Function} yScale - Y scale function
 */
function renderPlaytimePoints(filteredData, g, xScale, yScale) {
    const circles = g.selectAll(".playtime-circle")
        .data(filteredData, d => d.game);

    circles.exit().remove();

    const circlesEnter = circles.enter()
        .append("circle")
        .attr("class", "playtime-circle");

    const circlesUpdate = circlesEnter.merge(circles);

    circlesUpdate
        .attr("cx", d => xScale(d.hoursPlayed))
        .attr("cy", d => yScale(d.rating))
        .attr("r", 8)
        .attr("fill", d => getPlatformColor(d.platform))
        .attr("stroke", "rgba(255,255,255,0.3)")
        .attr("stroke-width", 1)
        .attr("opacity", 0.8)
        .style("cursor", "pointer")
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
    
    tooltip
        .style("display", "block")
        .html(`
            <div class="tooltip-title">${d.game}</div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Rating:</span>
                <span>${d.rating}/10</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Platform:</span>
                <span>${d.platform}</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Status:</span>
                <span>${d.status}</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Hours Played:</span>
                <span>${d.hoursPlayed}h</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">First Played:</span>
                <span>${d3.timeFormat("%b %d, %Y")(d.firstPlayedDate)}</span>
            </div>
            <div class="tooltip-detail">
                <span class="tooltip-label">Last Played:</span>
                <span>${d3.timeFormat("%b %d, %Y")(d.lastPlayedDate)}</span>
            </div>
            <div class="tooltip-tags">${tagHTML}</div>
            ${d.notes ? `<div style="margin-top: 8px; font-style: italic; color: #ccc;">"${d.notes}"</div>` : ''}
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