// Timeline chart module - main scatter plot showing rating vs last played date

import { getPlatformColor, ZOOM_CONFIG } from './config.js';

// Timeline chart configuration
const TIMELINE_CONFIG = {
    margin: { top: 20, right: 80, bottom: 80, left: 80 },
    width: 1200,
    height: 600,
    get chartWidth() { return this.width - this.margin.left - this.margin.right; },
    get chartHeight() { return this.height - this.margin.top - this.margin.bottom; }
};

// Global chart variables
let svg, g, xScale, yScale, tooltip, zoom, originalXScale;

/**
 * Create the main timeline chart
 * @param {Array} data - Game data array
 */
export function createTimelineChart(data) {
    const { margin, width, height, chartWidth, chartHeight } = TIMELINE_CONFIG;

    // Create SVG
    svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xExtent = d3.extent(data, d => d.displayDate);
    xScale = d3.scaleTime()
        .domain(xExtent)
        .range([0, chartWidth]);
    
    // Store original scale for zoom boundary calculations
    originalXScale = xScale.copy();

    yScale = d3.scaleLinear()
        .domain([0, 10])
        .range([chartHeight, 0]);

    // Create axes
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%b %Y"));

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
    const xAxisGroup = g.append("g")
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
        .text("Rating (0-10)");

    g.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text("Last Played Date");

    // Create tooltip
    tooltip = d3.select("#tooltip");

    // Calculate proper translate extent based on data bounds
    const dataMinX = originalXScale(xExtent[0]);
    const dataMaxX = originalXScale(xExtent[1]);
    const padding = 50; // Small padding beyond data extents
    
    // Add zoom behavior with data-bounded constraints
    zoom = d3.zoom()
        .scaleExtent(ZOOM_CONFIG.scaleExtent)
        .extent([[0, 0], [chartWidth, chartHeight]])
        .translateExtent([[dataMinX - padding, -Infinity], 
                         [dataMaxX + padding, Infinity]])
        .on("zoom", handleZoom);

    svg.call(zoom);
}

/**
 * Handle zoom events for the timeline chart
 * @param {Object} event - D3 zoom event
 */
function handleZoom(event) {
    const { chartWidth, chartHeight } = TIMELINE_CONFIG;
    let transform = event.transform;
    
    // Get the current data extent in screen coordinates after transformation
    const dataExtent = originalXScale.domain();
    const transformedMinX = transform.applyX(originalXScale(dataExtent[0]));
    const transformedMaxX = transform.applyX(originalXScale(dataExtent[1]));
    
    // Add padding buffer
    const padding = 50;
    
    // Check if we need to constrain the transform to keep data within bounds
    let newTransform = transform;
    
    // If leftmost data point would go beyond right edge (+ padding)
    if (transformedMinX > chartWidth + padding) {
        const targetMinX = chartWidth + padding;
        const correctedTranslateX = targetMinX - transform.k * originalXScale(dataExtent[0]);
        newTransform = d3.zoomIdentity.translate(correctedTranslateX, transform.y).scale(transform.k);
    }
    
    // If rightmost data point would go beyond left edge (- padding)
    if (transformedMaxX < -padding) {
        const targetMaxX = -padding;
        const correctedTranslateX = targetMaxX - transform.k * originalXScale(dataExtent[1]);
        newTransform = d3.zoomIdentity.translate(correctedTranslateX, transform.y).scale(transform.k);
    }
    
    // Apply the (possibly corrected) transform
    const newXScale = newTransform.rescaleX(originalXScale);
    
    // Update axis
    g.select(".axis")
        .call(d3.axisBottom(newXScale).tickFormat(d3.timeFormat("%b %Y")))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");
    
    // Update points
    g.selectAll(".rating-circle")
        .attr("cx", d => newXScale(d.displayDate));
    
    // Update grid
    g.select(".grid")
        .call(d3.axisBottom(newXScale)
            .tickSize(-chartHeight)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");
    
    // If we had to correct the transform, update the zoom transform
    if (newTransform !== transform) {
        svg.call(zoom.transform, newTransform);
    }
}

/**
 * Render data points on the timeline chart
 * @param {Array} filteredData - Filtered game data
 */
export function renderTimelinePoints(filteredData) {
    const circles = g.selectAll(".rating-circle")
        .data(filteredData, d => d.game);

    circles.exit().remove();

    const circlesEnter = circles.enter()
        .append("circle")
        .attr("class", "rating-circle");

    const circlesUpdate = circlesEnter.merge(circles);

    circlesUpdate
        .attr("cx", d => xScale(d.displayDate))
        .attr("cy", d => yScale(d.rating))
        .attr("r", d => Math.sqrt(d.hoursPlayed) * 0.8 + 4)
        .attr("fill", d => getPlatformColor(d.platform))
        .attr("opacity", 0.8)
        .style("cursor", "pointer") // Add pointer cursor to indicate clickability
        .on("mouseover", function(event, d) {
            d3.select(this).attr("opacity", 1);
            showTooltip(event, d);
        })
        .on("mousemove", function(event) {
            moveTooltip(event);
        })
        .on("mouseout", function() {
            d3.select(this).attr("opacity", 0.8);
            hideTooltip();
        })
        .on("click", function(event, d) {
            // Open URL in new tab/window when point is clicked
            if (d.url) {
                window.open(d.url, '_blank');
            }
        });
}

/**
 * Show tooltip for a game data point
 * @param {Object} event - Mouse event
 * @param {Object} d - Game data object
 */
function showTooltip(event, d) {
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
function moveTooltip(event) {
    tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px");
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    tooltip.style("display", "none");
} 