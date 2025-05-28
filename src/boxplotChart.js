// Boxplot chart module - shows rating distributions by tag

// Boxplot chart configuration
const BOXPLOT_CONFIG = {
    margin: { top: 20, right: 60, bottom: 60, left: 120 },
    width: 800,
    get chartWidth() { return this.width - this.margin.left - this.margin.right; },
    boxHeight: 40
};

let boxplotSvg = null;

/**
 * Calculate statistical values for boxplot
 * @param {Array} values - Array of numeric values
 * @returns {Object|null} Statistics object or null if no data
 */
function calculateBoxplotStats(values) {
    if (values.length === 0) return null;
    
    const sorted = values.slice().sort((a, b) => a - b);
    const q1 = d3.quantile(sorted, 0.25);
    const median = d3.quantile(sorted, 0.5);
    const q3 = d3.quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const min = Math.max(d3.min(sorted), q1 - 1.5 * iqr);
    const max = Math.min(d3.max(sorted), q3 + 1.5 * iqr);
    
    // Outliers are values outside the whiskers
    const outliers = sorted.filter(d => d < min || d > max);
    
    return {
        q1, median, q3, min, max, outliers,
        mean: d3.mean(values),
        count: values.length
    };
}

/**
 * Render the boxplot chart
 * @param {Array} filteredData - Filtered game data
 */
export function renderBoxplot(filteredData) {
    // Clear previous boxplot
    d3.select("#boxplotChart").selectAll("*").remove();
    
    if (filteredData.length === 0) {
        d3.select("#boxplotChart").append("div")
            .style("text-align", "center")
            .style("color", "#a0a0a0")
            .style("margin-top", "50px")
            .text("No data to display");
        return;
    }

    // Get only the selected tags from the filter
    const selectedTags = Array.from(document.querySelectorAll('#tagCheckboxes input:checked'))
        .map(cb => cb.value);

    if (selectedTags.length === 0) {
        d3.select("#boxplotChart").append("div")
            .style("text-align", "center")
            .style("color", "#a0a0a0")
            .style("margin-top", "50px")
            .text("No tags selected");
        return;
    }

    // Group data by selected tags and calculate stats
    const tagStats = [];
    
    selectedTags.forEach(tag => {
        const tagGames = filteredData.filter(d => d.tags.includes(tag));
        const ratings = tagGames.map(d => d.rating);
        const stats = calculateBoxplotStats(ratings);
        
        if (stats && stats.count >= 1) {
            tagStats.push({
                tag,
                stats,
                games: tagGames
            });
        }
    });

    // Sort by average rating (descending)
    tagStats.sort((a, b) => b.stats.mean - a.stats.mean);

    if (tagStats.length === 0) {
        d3.select("#boxplotChart").append("div")
            .style("text-align", "center")
            .style("color", "#a0a0a0")
            .style("margin-top", "50px")
            .text("No games found for selected tags");
        return;
    }

    // Calculate dimensions
    const { margin, width, chartWidth, boxHeight } = BOXPLOT_CONFIG;
    const contentHeight = tagStats.length * boxHeight;

    // Create SVG with full content height
    boxplotSvg = d3.select("#boxplotChart")
        .append("svg")
        .attr("width", width)
        .attr("height", contentHeight + margin.top + margin.bottom);

    const boxplotG = boxplotSvg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleLinear()
        .domain([0, 10])
        .range([0, chartWidth]);

    const yScale = d3.scaleBand()
        .domain(tagStats.map(d => d.tag))
        .range([0, contentHeight])
        .padding(0.2);

    // Add grid lines
    boxplotG.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${contentHeight})`)
        .call(d3.axisBottom(xScale)
            .tickSize(-contentHeight)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    boxplotG.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale)
            .tickSize(-chartWidth)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    // Add axes
    boxplotG.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${contentHeight})`)
        .call(d3.axisBottom(xScale).ticks(10));

    boxplotG.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(yScale));

    // Add axis labels
    boxplotG.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${chartWidth / 2}, ${contentHeight + 50})`)
        .style("text-anchor", "middle")
        .text("Rating");

    boxplotG.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + 20)
        .attr("x", 0 - (contentHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Tags");

    // Draw boxplots
    const boxplots = boxplotG.selectAll(".boxplot")
        .data(tagStats)
        .enter().append("g")
        .attr("class", "boxplot")
        .attr("transform", d => `translate(0,${yScale(d.tag)})`);

    const boxWidth = yScale.bandwidth() * 0.6;
    const boxY = yScale.bandwidth() * 0.2;

    // Draw boxplots for each tag
    drawBoxplotElements(boxplots, tagStats, xScale, yScale, boxWidth, boxY);

    // Add hover tooltips
    addBoxplotTooltips(boxplots);
}

/**
 * Draw the visual elements of each boxplot
 * @param {Object} boxplots - D3 selection of boxplot groups
 * @param {Array} tagStats - Array of tag statistics
 * @param {Function} xScale - X scale function
 * @param {Function} yScale - Y scale function
 * @param {number} boxWidth - Width of the box
 * @param {number} boxY - Y position of the box
 */
function drawBoxplotElements(boxplots, tagStats, xScale, yScale, boxWidth, boxY) {
    tagStats.forEach((d, i) => {
        const boxplot = d3.select(boxplots.nodes()[i]);
        
        if (d.stats.count === 1) {
            // Single point - just show a circle
            boxplot.append("circle")
                .attr("cx", xScale(d.stats.median))
                .attr("cy", yScale.bandwidth() / 2)
                .attr("r", 6)
                .style("fill", "#4fc3f7")
                .style("stroke", "#ffffff")
                .style("stroke-width", 2);
        } else {
            // Multiple points - draw full boxplot
            
            // Draw whiskers
            boxplot.append("line")
                .attr("x1", xScale(d.stats.min))
                .attr("x2", xScale(d.stats.max))
                .attr("y1", yScale.bandwidth() / 2)
                .attr("y2", yScale.bandwidth() / 2)
                .style("stroke", "#e0e0e0")
                .style("stroke-width", 1);

            // Draw whisker caps
            boxplot.append("line")
                .attr("x1", xScale(d.stats.min))
                .attr("x2", xScale(d.stats.min))
                .attr("y1", boxY)
                .attr("y2", boxY + boxWidth)
                .style("stroke", "#e0e0e0")
                .style("stroke-width", 1);

            boxplot.append("line")
                .attr("x1", xScale(d.stats.max))
                .attr("x2", xScale(d.stats.max))
                .attr("y1", boxY)
                .attr("y2", boxY + boxWidth)
                .style("stroke", "#e0e0e0")
                .style("stroke-width", 1);

            // Draw box
            boxplot.append("rect")
                .attr("x", xScale(d.stats.q1))
                .attr("y", boxY)
                .attr("width", xScale(d.stats.q3) - xScale(d.stats.q1))
                .attr("height", boxWidth)
                .style("fill", "rgba(79, 195, 247, 0.3)")
                .style("stroke", "#4fc3f7")
                .style("stroke-width", 2);

            // Draw median line
            boxplot.append("line")
                .attr("x1", xScale(d.stats.median))
                .attr("x2", xScale(d.stats.median))
                .attr("y1", boxY)
                .attr("y2", boxY + boxWidth)
                .style("stroke", "#ffffff")
                .style("stroke-width", 2);

            // Draw mean point
            boxplot.append("circle")
                .attr("cx", xScale(d.stats.mean))
                .attr("cy", yScale.bandwidth() / 2)
                .attr("r", 4)
                .style("fill", "#ff6b6b")
                .style("stroke", "#ffffff")
                .style("stroke-width", 1);

            // Draw outliers
            boxplot.selectAll(".outlier")
                .data(d.stats.outliers.map(outlier => ({tag: d.tag, rating: outlier})))
                .enter().append("circle")
                .attr("class", "outlier")
                .attr("cx", d => xScale(d.rating))
                .attr("cy", yScale.bandwidth() / 2)
                .attr("r", 3)
                .style("fill", "none")
                .style("stroke", "#ff9800")
                .style("stroke-width", 2);
        }
    });
}

/**
 * Add hover tooltips to boxplots
 * @param {Object} boxplots - D3 selection of boxplot groups
 */
function addBoxplotTooltips(boxplots) {
    const tooltip = d3.select("#tooltip");
    
    boxplots
        .on("mouseover", function(event, d) {
            tooltip
                .style("display", "block")
                .html(`
                    <div class="tooltip-title">${d.tag}</div>
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Games:</span>
                        <span>${d.stats.count}</span>
                    </div>
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Mean Rating:</span>
                        <span>${d.stats.mean.toFixed(1)}</span>
                    </div>
                    ${d.stats.count > 1 ? `
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Median:</span>
                        <span>${d.stats.median.toFixed(1)}</span>
                    </div>
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Range:</span>
                        <span>${d.stats.min.toFixed(1)} - ${d.stats.max.toFixed(1)}</span>
                    </div>
                    ` : ''}
                    ${d.stats.outliers.length > 0 ? `<div class="tooltip-detail">
                        <span class="tooltip-label">Outliers:</span>
                        <span>${d.stats.outliers.map(o => o.toFixed(1)).join(', ')}</span>
                    </div>` : ''}
                `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            tooltip.style("display", "none");
        });
} 