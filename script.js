// Global variables
let data = [];

// Platform colors
const getPlatformColor = (platform) => {
    const colors = {
        'PC': '#ff6b6b',
        'PS4': '#4ecdc4',
        'PS5': '#45b7d1', 
        'Switch': '#96ceb4',
        'Xbox': '#ffeaa7'
    };
    return colors[platform] || '#ddd';
};

// Load data from JSON
async function loadData() {
    try {
        const response = await fetch('./games.json');
        const jsonData = await response.json();
        
        // Process the data (minimal processing needed with JSON)
        data = jsonData.map(d => ({
            ...d,
            firstPlayedDate: new Date(d.firstPlayed),
            lastPlayedDate: new Date(d.lastPlayed),
            displayDate: new Date(d.lastPlayed)
        }));

        console.log('✅ Data loaded successfully:', data.length, 'games');
        
        // Initialize the dashboard
        initializeDashboard();
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        
        // Show error message to user
        document.querySelector('.container').innerHTML = `
            <div style="text-align: center; margin-top: 100px;">
                <h2 style="color: #ff6b6b;">⚠️ Could not load game data</h2>
                <p style="color: #a0a0a0; margin: 20px 0;">
                    Make sure <code>games.json</code> is in the same directory and you're running a local server.
                </p>
                <p style="color: #a0a0a0; font-size: 0.9em;">
                    Try: <code>python -m http.server 8000</code> or <code>npx serve .</code>
                </p>
            </div>
        `;
    }
}

function initializeDashboard() {
    createCharts();
    populateFilters();
    updateVisualization();
}

function createCharts() {
    createTimelineChart();
    // Boxplot and playtime charts will be created when renderBoxplot/renderPlaytimeChart are called
}

// Set up dimensions and margins
const margin = {top: 20, right: 80, bottom: 80, left: 80};
const width = 1200 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

// Global chart variables
let svg, g, xScale, yScale, tooltip, zoom;

function createTimelineChart() {
    // Create SVG
    svg = d3.select("#chart")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xExtent = d3.extent(data, d => d.displayDate);
    xScale = d3.scaleTime()
        .domain(xExtent)
        .range([0, width]);

    yScale = d3.scaleLinear()
        .domain([0, 10])
        .range([height, 0]);

    // Create axes
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%b %Y"));

    const yAxis = d3.axisLeft(yScale);

    // Add grid lines
    g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .tickSize(-height)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale)
            .tickSize(-width)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    // Add axes
    const xAxisGroup = g.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
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
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Rating (0-10)");

    g.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text("Last Played Date");

    // Create tooltip
    tooltip = d3.select("#tooltip");

    // Add zoom behavior with constraints
    zoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .extent([[0, 0], [width, height]])
        .translateExtent([[-width * 2, -Infinity], [width * 3, Infinity]])
        .on("zoom", (event) => {
            const transform = event.transform;
            const newXScale = transform.rescaleX(xScale);
            
            // Constrain to data bounds
            const dataXExtent = d3.extent(data, d => d.displayDate);
            const currentDomain = newXScale.domain();
            
            // If we're zoomed out beyond data, reset
            if (currentDomain[0] < dataXExtent[0] && currentDomain[1] > dataXExtent[1]) {
                // Allow this - we're showing full range plus some padding
            } else {
                // Constrain to not go beyond data bounds when zoomed in
                const domainWidth = currentDomain[1] - currentDomain[0];
                if (currentDomain[0] < dataXExtent[0]) {
                    newXScale.domain([dataXExtent[0], dataXExtent[0].getTime() + domainWidth]);
                }
                if (currentDomain[1] > dataXExtent[1]) {
                    newXScale.domain([dataXExtent[1].getTime() - domainWidth, dataXExtent[1]]);
                }
            }
            
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
                    .tickSize(-height)
                    .tickFormat("")
                )
                .selectAll("line")
                .attr("class", "grid-line");
        });

    svg.call(zoom);
}

// Function to render data points
function renderPoints(filteredData) {
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
        .on("mouseover", function(event, d) {
            d3.select(this).attr("opacity", 1);
            
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
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("opacity", 0.8);
            tooltip.style("display", "none");
        });
}

// Boxplot visualization
let boxplotSvg = null;
const boxplotMargin = {top: 20, right: 60, bottom: 60, left: 120};
const boxplotWidth = 800 - boxplotMargin.left - boxplotMargin.right;

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

function renderBoxplot(filteredData) {
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
    const boxHeight = 40;
    const contentHeight = tagStats.length * boxHeight;

    // Create SVG with full content height
    boxplotSvg = d3.select("#boxplotChart")
        .append("svg")
        .attr("width", boxplotWidth + boxplotMargin.left + boxplotMargin.right)
        .attr("height", contentHeight + boxplotMargin.top + boxplotMargin.bottom);

    const boxplotG = boxplotSvg.append("g")
        .attr("transform", `translate(${boxplotMargin.left},${boxplotMargin.top})`);

    // Create scales
    const xScale = d3.scaleLinear()
        .domain([0, 10])
        .range([0, boxplotWidth]);

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
            .tickSize(-boxplotWidth)
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
        .attr("transform", `translate(${boxplotWidth / 2}, ${contentHeight + 50})`)
        .style("text-anchor", "middle")
        .text("Rating");

    boxplotG.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - boxplotMargin.left + 20)
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

    // Add hover tooltips
    boxplots
        .on("mouseover", function(event, d) {
            const tooltip = d3.select("#tooltip");
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
            d3.select("#tooltip")
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            d3.select("#tooltip").style("display", "none");
        });
}

// Playtime vs Rating scatter plot
let playtimeSvg = null;
const playtimeMargin = {top: 20, right: 80, bottom: 80, left: 80};
const playtimeWidth = 1200 - playtimeMargin.left - playtimeMargin.right;
const playtimeHeight = 600 - playtimeMargin.top - playtimeMargin.bottom;

function renderPlaytimeChart(filteredData) {
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

    // Create SVG
    playtimeSvg = d3.select("#playtimeChart")
        .append("svg")
        .attr("width", playtimeWidth + playtimeMargin.left + playtimeMargin.right)
        .attr("height", playtimeHeight + playtimeMargin.top + playtimeMargin.bottom);

    const playtimeG = playtimeSvg.append("g")
        .attr("transform", `translate(${playtimeMargin.left},${playtimeMargin.top})`);

    // Create scales
    const playtimeXScale = d3.scaleLinear()
        .domain([0, d3.max(filteredData, d => d.hoursPlayed) * 1.1])
        .range([0, playtimeWidth]);

    const playtimeYScale = d3.scaleLinear()
        .domain([0, 10])
        .range([playtimeHeight, 0]);

    // Create axes
    const playtimeXAxis = d3.axisBottom(playtimeXScale);
    const playtimeYAxis = d3.axisLeft(playtimeYScale);

    // Add grid lines
    playtimeG.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${playtimeHeight})`)
        .call(d3.axisBottom(playtimeXScale)
            .tickSize(-playtimeHeight)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    playtimeG.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(playtimeYScale)
            .tickSize(-playtimeWidth)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("class", "grid-line");

    // Add axes
    const playtimeXAxisGroup = playtimeG.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${playtimeHeight})`)
        .call(playtimeXAxis);

    const playtimeYAxisGroup = playtimeG.append("g")
        .attr("class", "axis")
        .call(playtimeYAxis);

    // Add axis labels
    playtimeG.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - playtimeMargin.left)
        .attr("x", 0 - (playtimeHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Rating (0-10)");

    playtimeG.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(${playtimeWidth / 2}, ${playtimeHeight + playtimeMargin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text("Hours Played");

    // Add zoom behavior
    const playtimeZoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .extent([[0, 0], [playtimeWidth, playtimeHeight]])
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(playtimeXScale);
            const newYScale = event.transform.rescaleY(playtimeYScale);
            
            // Update axes
            playtimeXAxisGroup.call(d3.axisBottom(newXScale));
            playtimeYAxisGroup.call(d3.axisLeft(newYScale));
            
            // Update points
            playtimeG.selectAll(".playtime-circle")
                .attr("cx", d => newXScale(d.hoursPlayed))
                .attr("cy", d => newYScale(d.rating));
            
            // Update grid
            playtimeG.select(".grid")
                .call(d3.axisBottom(newXScale)
                    .tickSize(-playtimeHeight)
                    .tickFormat("")
                )
                .selectAll("line")
                .attr("class", "grid-line");

            playtimeG.selectAll(".grid").filter(function(d, i) { return i === 1; })
                .call(d3.axisLeft(newYScale)
                    .tickSize(-playtimeWidth)
                    .tickFormat("")
                )
                .selectAll("line")
                .attr("class", "grid-line");
        });

    playtimeSvg.call(playtimeZoom);

    // Render data points
    renderPlaytimePoints(filteredData, playtimeG, playtimeXScale, playtimeYScale);
}

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
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("opacity", 0.8)
                .attr("stroke-width", 1)
                .attr("stroke", "rgba(255,255,255,0.3)")
                .style("filter", "brightness(1)");
            tooltip.style("display", "none");
        });
}

// Populate filter controls
function populateFilters() {
    // Platform checkboxes
    const platforms = [...new Set(data.map(d => d.platform))].sort();
    const platformContainer = d3.select("#platformCheckboxes");
    
    platforms.forEach(platform => {
        const item = platformContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `platform-${platform}`)
            .attr("value", platform)
            .attr("checked", true)
            .on("change", updateVisualization);
        
        item.append("label")
            .attr("for", `platform-${platform}`)
            .style("color", getPlatformColor(platform))
            .text(platform);
    });

    // Tag checkboxes
    const allTags = [...new Set(data.flatMap(d => d.tags))].sort();
    const tagContainer = d3.select("#tagCheckboxes");
    
    allTags.forEach(tag => {
        const item = tagContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `tag-${tag}`)
            .attr("value", tag)
            .attr("checked", true)
            .on("change", updateVisualization);
        
        item.append("label")
            .attr("for", `tag-${tag}`)
            .text(tag);
    });

    // Status checkboxes
    const statuses = [...new Set(data.map(d => d.status))].sort();
    const statusContainer = d3.select("#statusCheckboxes");
    
    statuses.forEach(status => {
        const item = statusContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `status-${status}`)
            .attr("value", status)
            .attr("checked", true)
            .on("change", updateVisualization);
        
        item.append("label")
            .attr("for", `status-${status}`)
            .text(status);
    });

    // Date range inputs
    const dateExtent = d3.extent(data, d => d.displayDate);
    document.getElementById("startDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[0]);
    document.getElementById("endDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[1]);
    
    document.getElementById("startDate").addEventListener("change", updateVisualization);
    document.getElementById("endDate").addEventListener("change", updateVisualization);
}

// Filter data based on selections
function getFilteredData() {
    // Get selected platforms
    const selectedPlatforms = Array.from(document.querySelectorAll('#platformCheckboxes input:checked'))
        .map(cb => cb.value);
    
    // Get selected tags
    const selectedTags = Array.from(document.querySelectorAll('#tagCheckboxes input:checked'))
        .map(cb => cb.value);
    
    // Get selected statuses
    const selectedStatuses = Array.from(document.querySelectorAll('#statusCheckboxes input:checked'))
        .map(cb => cb.value);
    
    // Get date range
    const startDate = new Date(document.getElementById("startDate").value);
    const endDate = new Date(document.getElementById("endDate").value);
    endDate.setHours(23, 59, 59); // Include the entire end date

    return data.filter(d => {
        // Platform filter
        const platformMatch = selectedPlatforms.includes(d.platform);
        
        // Tag filter (game must have at least one selected tag)
        const tagMatch = selectedTags.length === 0 || d.tags.some(tag => selectedTags.includes(tag));
        
        // Status filter
        const statusMatch = selectedStatuses.includes(d.status);
        
        // Date filter
        const dateMatch = d.displayDate >= startDate && d.displayDate <= endDate;
        
        return platformMatch && tagMatch && statusMatch && dateMatch;
    });
}

// Update statistics
function updateStats(filteredData) {
    const avgRating = filteredData.length > 0 ? d3.mean(filteredData, d => d.rating).toFixed(1) : 0;
    const totalHours = d3.sum(filteredData, d => d.hoursPlayed);
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
            <div class="stat-value">${totalHours}h</div>
            <div class="stat-label">Total Hours</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${topRated ? topRated.rating : 'N/A'}</div>
            <div class="stat-label">Highest Rated${topRated ? `: ${topRated.game}` : ''}</div>
        </div>
    `);
}

function updateVisualization() {
    const filteredData = getFilteredData();
    renderPoints(filteredData);
    updateStats(filteredData);
    renderBoxplot(filteredData);
    renderPlaytimeChart(filteredData);
}

// Clear filter functions
function clearPlatformFilters() {
    document.querySelectorAll('#platformCheckboxes input').forEach(cb => cb.checked = true);
    updateVisualization();
}

function clearTagFilters() {
    document.querySelectorAll('#tagCheckboxes input').forEach(cb => cb.checked = true);
    updateVisualization();
}

function clearStatusFilters() {
    document.querySelectorAll('#statusCheckboxes input').forEach(cb => cb.checked = true);
    updateVisualization();
}

function clearDateFilter() {
    const dateExtent = d3.extent(data, d => d.displayDate);
    document.getElementById("startDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[0]);
    document.getElementById("endDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[1]);
    updateVisualization();
}

// Data source instructions
console.log("📊 JSON Data Format:");
console.log("Your JSON should be an array of game objects with properties: game, platform, tags (array), rating, firstPlayed, lastPlayed, hoursPlayed, status, notes");
console.log("🚀 To use your own data: Replace games.json with your data file");
console.log("☁️ For S3 hosting: Update the fetch URL in loadData() function");

// Initialize the application
loadData();