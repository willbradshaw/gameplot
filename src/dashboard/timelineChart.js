import { getPlatformColor, ZOOM_CONFIG } from './config.js';

export function createTimeline(root, idPrefix) {
  // Timeline chart module - main scatter plot showing rating vs last played date

  // Timeline chart configuration
  const TIMELINE_CONFIG = {
    margin: { top: 20, right: 80, bottom: 80, left: 80 },
    width: 1200,
    height: 600,
    get chartWidth() {
      return this.width - this.margin.left - this.margin.right;
    },
    get chartHeight() {
      return this.height - this.margin.top - this.margin.bottom;
    },
  };

  // State for this mounted chart
  let svg, g, xScale, yScale, tooltip, zoom, originalXScale;

  /**
   * Create the main timeline chart
   * @param {Array} data - Game data array
   */
  function createTimelineChart(data) {
    TIMELINE_CONFIG.width = Math.max(700, root.querySelector('[data-role="chart"]').clientWidth);
    const { margin, width, height, chartWidth, chartHeight } = TIMELINE_CONFIG;

    d3.select(root).select('[data-role="chart"]').selectAll('*').remove();
    // Create SVG
    svg = d3
      .select(root)
      .select('[data-role="chart"]')
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height);

    g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Add clipping path to constrain points to chart area
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', `${idPrefix}-timeline-clip`)
      .append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight);

    // Create scales - convert lastPlayedTotal strings to Date objects
    const dates = data.map((d) => new Date(d.lastPlayedTotal)).filter((d) => !Number.isNaN(d.getTime()));
    const xExtent = d3.extent(dates);
    xScale = d3.scaleUtc().domain(xExtent).range([0, chartWidth]);

    // Store original scale for zoom boundary calculations
    originalXScale = xScale.copy();

    yScale = d3.scaleLinear().domain([0, 10]).range([chartHeight, 0]);

    // Create axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.utcFormat('%b %Y'));

    const yAxis = d3.axisLeft(yScale);

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale).tickSize(-chartHeight).tickFormat(''))
      .selectAll('line')
      .attr('class', 'grid-line');

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale).tickSize(-chartWidth).tickFormat(''))
      .selectAll('line')
      .attr('class', 'grid-line');

    // Add axes
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    g.append('g').attr('class', 'axis').call(yAxis);

    // Add axis labels
    g.append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - chartHeight / 2)
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .text('Rating (0-10)');

    g.append('text')
      .attr('class', 'axis-label')
      .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
      .style('text-anchor', 'middle')
      .text('Last Played Date');

    // Create tooltip
    tooltip = d3.select(root).select('[data-role="tooltip"]');

    // Calculate proper translate extent based on data bounds
    const dataMinX = originalXScale(xExtent[0]);
    const dataMaxX = originalXScale(xExtent[1]);
    const padding = 50; // Small padding beyond data extents

    // Add zoom behavior with data-bounded constraints
    zoom = d3
      .zoom()
      .scaleExtent(ZOOM_CONFIG.scaleExtent)
      .extent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .translateExtent([
        [dataMinX - padding, -Infinity],
        [dataMaxX + padding, Infinity],
      ])
      .on('zoom', handleZoom);

    svg.call(zoom);
  }

  /**
   * Handle zoom events for the timeline chart
   * @param {Object} event - D3 zoom event
   */
  function handleZoom(event) {
    const { chartHeight } = TIMELINE_CONFIG;
    const transform = event.transform;
    const newXScale = transform.rescaleX(originalXScale);

    // Update axis
    g.select('.axis')
      .call(d3.axisBottom(newXScale).tickFormat(d3.utcFormat('%b %Y')))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    // Update points
    g.selectAll('.rating-circle').attr('cx', (d) => newXScale(new Date(d.lastPlayedTotal)));

    // Update grid
    g.select('.grid')
      .call(d3.axisBottom(newXScale).tickSize(-chartHeight).tickFormat(''))
      .selectAll('line')
      .attr('class', 'grid-line');
  }

  /**
   * Render data points on the timeline chart
   * @param {Array} filteredData - Filtered game data
   */
  function renderTimelinePoints(filteredData) {
    g.selectAll('.empty-message').remove();
    g.selectAll('.axis, .grid, .axis-label').style('display', filteredData.length ? null : 'none');
    if (filteredData.length === 0) {
      g.selectAll('.rating-circle').remove();
      g.append('text')
        .attr('class', 'empty-message')
        .attr('x', TIMELINE_CONFIG.chartWidth / 2)
        .attr('y', TIMELINE_CONFIG.chartHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-secondary)')
        .text('No data to display');
      return;
    }

    // Preserve the viewport while zoomed; otherwise fit the selected games.
    const transform = d3.zoomTransform(svg.node());
    if (transform.k === 1 && transform.x === 0) updateTimelineScales(filteredData);
    const displayXScale = transform.rescaleX(originalXScale);

    const circles = g.selectAll('.rating-circle').data(filteredData, (d) => d.game);

    circles.exit().remove();

    const circlesEnter = circles
      .enter()
      .append('circle')
      .attr('class', 'rating-circle')
      .attr('clip-path', `url(#${idPrefix}-timeline-clip)`);

    const circlesUpdate = circlesEnter.merge(circles);

    circlesUpdate
      .attr('cx', (d) => displayXScale(new Date(d.lastPlayedTotal)))
      .attr('cy', (d) => yScale(d.rating))
      .attr('r', (d) => Math.sqrt(d.hoursPlayedTotal) * 0.8 + 4)
      .attr('fill', (d) => getPlatformColor(d.platforms[0])) // Use first platform for color
      .attr('opacity', 0.8)
      .style('cursor', 'pointer') // Add pointer cursor to indicate clickability
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);
        showTooltip(event, d);
      })
      .on('mousemove', (event) => {
        moveTooltip(event);
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.8);
        hideTooltip();
      })
      .on('click', (_event, d) => {
        // Open URL in new tab/window when point is clicked
        if (d.displayUrl) {
          window.open(d.displayUrl, '_blank');
        }
      });
  }

  /**
   * Update timeline chart scales and axes based on filtered data
   * @param {Array} filteredData - Filtered game data
   */
  function updateTimelineScales(filteredData) {
    const { chartWidth, chartHeight } = TIMELINE_CONFIG;

    // Calculate new domains based on filtered data
    const dates = filteredData
      .map((d) => new Date(d.lastPlayedTotal))
      .filter((d) => !Number.isNaN(d.getTime()));
    const ratings = filteredData.map((d) => d.rating).filter((r) => r !== null && r !== undefined);

    if (dates.length === 0 || ratings.length === 0) return;

    // Update X scale (dates) with some padding
    const dateExtent = d3.extent(dates);
    const datePadding = Math.max(86400000, (dateExtent[1] - dateExtent[0]) * 0.05); // At least one day for a single date
    const newDateDomain = [
      new Date(dateExtent[0].getTime() - datePadding),
      new Date(dateExtent[1].getTime() + datePadding),
    ];

    xScale.domain(newDateDomain);
    originalXScale.domain(newDateDomain);

    // Update Y scale (ratings) with some padding
    const ratingExtent = d3.extent(ratings);
    const ratingPadding = Math.max(0.5, (ratingExtent[1] - ratingExtent[0]) * 0.1); // At least half a rating point for a single rating
    const newRatingDomain = [
      Math.max(0, ratingExtent[0] - ratingPadding),
      Math.min(10, ratingExtent[1] + ratingPadding),
    ];

    yScale.domain(newRatingDomain);

    // Update axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.utcFormat('%b %Y'));
    const yAxis = d3.axisLeft(yScale);

    g.select('.axis')
      .call(xAxis)
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    g.selectAll('.axis')
      .filter((_d, i) => i === 1)
      .call(yAxis);

    // Update grid lines
    g.selectAll('.grid')
      .filter((_d, i) => i === 0)
      .call(d3.axisBottom(xScale).tickSize(-chartHeight).tickFormat(''))
      .selectAll('line')
      .attr('class', 'grid-line');

    g.selectAll('.grid')
      .filter((_d, i) => i === 1)
      .call(d3.axisLeft(yScale).tickSize(-chartWidth).tickFormat(''))
      .selectAll('line')
      .attr('class', 'grid-line');

    // Update zoom translate extent based on new domain
    const dataMinX = originalXScale(newDateDomain[0]);
    const dataMaxX = originalXScale(newDateDomain[1]);
    const padding = 50;

    zoom.translateExtent([
      [dataMinX - padding, -Infinity],
      [dataMaxX + padding, Infinity],
    ]);
  }

  function resetTimelineZoom() {
    svg.call(zoom.transform, d3.zoomIdentity);
  }

  /**
   * Show tooltip for a game data point
   * @param {Object} event - Mouse event
   * @param {Object} d - Game data object
   */
  function showTooltip(event, d) {
    const tagHTML = d.tags.map((tag) => `<span class="tooltip-tag">${tag}</span>`).join('');
    const platformsText = d.platforms.join(', ');

    tooltip
      .style('display', 'block')
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
                <span>${d.lastPlayedTotal}</span>
            </div>
            <div class="tooltip-tags">${tagHTML}</div>
        `)
      .style('left', `${event.clientX + 10}px`)
      .style('top', `${event.clientY - 10}px`);
  }

  /**
   * Move tooltip to follow mouse
   * @param {Object} event - Mouse event
   */
  function moveTooltip(event) {
    tooltip.style('left', `${event.clientX + 10}px`).style('top', `${event.clientY - 10}px`);
  }

  /**
   * Hide tooltip
   */
  function hideTooltip() {
    tooltip.style('display', 'none');
  }

  function resize(data) {
    const previous = d3.zoomTransform(svg.node());
    const previousWidth = TIMELINE_CONFIG.chartWidth;
    createTimelineChart(data);
    renderTimelinePoints(data);
    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate((previous.x * TIMELINE_CONFIG.chartWidth) / previousWidth, previous.y)
        .scale(previous.k),
    );
  }

  return { createTimelineChart, renderTimelinePoints, resetTimelineZoom, resize };
}
