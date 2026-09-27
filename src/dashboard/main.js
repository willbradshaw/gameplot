// Main application file - coordinates all modules and handles app lifecycle

import { loadGameData } from './dataLoader.js';
import {
  clearDateFilter,
  clearPlatformFilters,
  clearRatingFilters,
  clearStatusFilters,
  clearTagFilters,
  getFilteredData,
  populateFilters,
  resetAllFilters,
  selectAllPlatforms,
  selectAllRatings,
  selectAllStatuses,
  selectAllTags,
  selectOnlyPlatform,
  selectOnlyRating,
  selectOnlyStatus,
  selectOnlyTag,
} from './filters.js';
import {
  clearSearch,
  downloadTableAsCSV,
  initializeTableSearch,
  initializeTableSorting,
  renderTable,
} from './gamesTable.js';
import { initializePlaytimeAggregation, updatePlaytimeAggregation } from './playtimeAggregationChart.js';
import { renderPlaytimeChart } from './playtimeChart.js';
import { updateStats } from './statistics.js';
import { createTimelineChart, renderTimelinePoints, resetTimelineZoom } from './timelineChart.js';

/**
 * Initialize the dashboard application
 */
async function initializeDashboard() {
  try {
    // Load the game data
    const data = await loadGameData();

    const message = document.getElementById('dashboard-message');
    if (data.length === 0) {
      message.textContent =
        'No games to display. Games need a rating, status and tags before they appear here.';
      return;
    }
    // Reveal charts before measuring their container dimensions.
    document.getElementById('dashboard-content').hidden = false;

    // Create the main timeline chart
    createTimelineChart(data);

    // Initialize table sorting
    initializeTableSorting();

    // Initialize table search
    initializeTableSearch();

    // Initialize playtime aggregation chart
    initializePlaytimeAggregation(data);

    // Populate filter controls
    populateFilters();

    // Set up event listeners for filter changes
    setupEventListeners();

    // Initial visualization update
    await updateVisualization();

    message.hidden = true;
  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    document.getElementById('dashboard-content').hidden = true;
    const message = document.getElementById('dashboard-message');
    message.hidden = false;
    message.textContent =
      'Could not load the dashboard. Run gameplot process to generate data/games.json, then reload this page from a web server.';
  }
}

/**
 * Set up event listeners for the application
 */
function setupEventListeners() {
  // Listen for filter changes
  document.addEventListener('filtersChanged', () => {
    updateVisualization().catch((error) => {
      console.error('Error updating visualization:', error);
    });
  });

  // Listen for table-based filter requests
  document.addEventListener('tableFilterRequested', handleTableFilterRequest);

  // Set up clear filter button handlers
  setupClearFilterButtons();

  // Set up CSV download button
  setupCsvDownloadButton();
}

/**
 * Set up clear filter button event handlers
 */
function setupClearFilterButtons() {
  // Make clear filter functions available globally for button onclick handlers
  window.clearPlatformFilters = clearPlatformFilters;
  window.clearTagFilters = clearTagFilters;
  window.clearStatusFilters = clearStatusFilters;
  window.clearRatingFilters = clearRatingFilters;
  window.clearDateFilter = clearDateFilter;

  // Make select all filter functions available globally
  window.selectAllPlatforms = selectAllPlatforms;
  window.selectAllTags = selectAllTags;
  window.selectAllStatuses = selectAllStatuses;
  window.selectAllRatings = selectAllRatings;

  // Make reset all filters function available globally
  window.resetAllFilters = () => {
    resetTimelineZoom();
    clearSearch();
    resetAllFilters();
  };
}

/**
 * Set up CSV download button event handler
 */
function setupCsvDownloadButton() {
  // Make CSV download function available globally for button onclick handler
  window.downloadTableAsCSV = downloadTableAsCSV;

  // Make clear search function available globally for button onclick handler
  window.clearGameSearch = clearSearch;
}

/**
 * Update all visualizations based on current filter settings
 */
async function updateVisualization() {
  const filteredData = getFilteredData();
  document.getElementById('tooltip').style.display = 'none';

  // Update all charts and table with filtered data
  renderTimelinePoints(filteredData);
  renderTable(filteredData);
  updatePlaytimeAggregation(filteredData);
  renderPlaytimeChart(filteredData);

  // Update statistics (now async)
  await updateStats(filteredData);

  console.log(`📊 Visualization updated with ${filteredData.length} games`);
}

/**
 * Handle filter requests from table element clicks
 * @param {CustomEvent} event - Filter request event
 */
function handleTableFilterRequest(event) {
  const { type, value } = event.detail;

  switch (type) {
    case 'platform':
      selectOnlyPlatform(value);
      break;
    case 'tag':
      selectOnlyTag(value);
      break;
    case 'status':
      selectOnlyStatus(value);
      break;
    case 'rating':
      selectOnlyRating(value);
      break;
    default:
      console.warn('Unknown filter type:', type);
  }
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);
