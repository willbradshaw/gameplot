// Main application file - coordinates all modules and handles app lifecycle

import { loadGameData } from './dataLoader.js';
import { createTimelineChart, renderTimelinePoints } from './timelineChart.js';
import { renderBoxplot } from './boxplotChart.js';
import { renderPlaytimeChart } from './playtimeChart.js';
import { populateFilters, getFilteredData, clearPlatformFilters, clearTagFilters, clearStatusFilters, clearDateFilter } from './filters.js';
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
    
    // Set up clear filter button handlers
    setupClearFilterButtons();
}

/**
 * Set up clear filter button event handlers
 */
function setupClearFilterButtons() {
    // Make clear filter functions available globally for button onclick handlers
    window.clearPlatformFilters = clearPlatformFilters;
    window.clearTagFilters = clearTagFilters;
    window.clearStatusFilters = clearStatusFilters;
    window.clearDateFilter = clearDateFilter;
}

/**
 * Update all visualizations based on current filter settings
 */
function updateVisualization() {
    const filteredData = getFilteredData();
    
    // Update all charts with filtered data
    renderTimelinePoints(filteredData);
    renderBoxplot(filteredData);
    renderPlaytimeChart(filteredData);
    
    // Update statistics
    updateStats(filteredData);
    
    console.log(`📊 Visualization updated with ${filteredData.length} games`);
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard); 