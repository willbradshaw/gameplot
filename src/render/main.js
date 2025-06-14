// Main application file - coordinates all modules and handles app lifecycle

import { loadGameData } from './dataLoader.js';
import { createTimelineChart, renderTimelinePoints } from './timelineChart.js';
import { renderBoxplot } from './boxplotChart.js';
import { renderPlaytimeChart } from './playtimeChart.js';
import { renderTable, initializeTableSorting, initializeTableSearch, downloadTableAsCSV, clearSearch } from './gamesTable.js';
import { populateFilters, getFilteredData, clearPlatformFilters, clearTagFilters, clearStatusFilters, clearRatingFilters, clearDateFilter, selectOnlyPlatform, selectOnlyTag, selectOnlyStatus, selectOnlyRating } from './filters.js';
import { updateStats } from './statistics.js';

/**
 * Initialize the dashboard application
 */
async function initializeDashboard() {
    try {
        // Load the game data
        const data = await loadGameData();
        
        // Create the main timeline chart
        createTimelineChart(data);
        
        // Initialize table sorting
        initializeTableSorting();
        
        // Initialize table search
        initializeTableSearch();
        
        // Populate filter controls
        populateFilters();
        
        // Set up event listeners for filter changes
        setupEventListeners();
        
        // Initial visualization update
        updateVisualization();
        
        console.log('✅ Dashboard initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize dashboard:', error);
    }
}

/**
 * Set up event listeners for the application
 */
function setupEventListeners() {
    // Listen for filter changes
    document.addEventListener('filtersChanged', updateVisualization);
    
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
function updateVisualization() {
    const filteredData = getFilteredData();
    
    // Update all charts and table with filtered data
    renderTimelinePoints(filteredData);
    renderTable(filteredData);
    renderBoxplot(filteredData);
    renderPlaytimeChart(filteredData);
    
    // Update statistics
    updateStats(filteredData);
    
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