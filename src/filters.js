// Filters module - handles all filter controls and data filtering

import { getPlatformColor } from './config.js';
import { getGameData } from './dataLoader.js';

/**
 * Populate all filter controls with data from the game dataset
 */
export function populateFilters() {
    const data = getGameData();
    
    populatePlatformFilters(data);
    populateTagFilters(data);
    populateStatusFilters(data);
    populateDateFilters(data);
}

/**
 * Populate platform filter checkboxes
 * @param {Array} data - Game data array
 */
function populatePlatformFilters(data) {
    // Extract all platforms from the platforms arrays and flatten them
    const platforms = [...new Set(data.flatMap(d => d.platforms))].sort();
    const platformContainer = d3.select("#platformCheckboxes");
    
    platforms.forEach(platform => {
        const item = platformContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `platform-${platform}`)
            .attr("value", platform)
            .attr("checked", true)
            .on("change", () => {
                // Trigger update event that main app can listen to
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            });
        
        item.append("label")
            .attr("for", `platform-${platform}`)
            .style("color", getPlatformColor(platform))
            .text(platform);
    });
}

/**
 * Populate tag filter checkboxes
 * @param {Array} data - Game data array
 */
function populateTagFilters(data) {
    const allTags = [...new Set(data.flatMap(d => d.tags))].sort();
    const tagContainer = d3.select("#tagCheckboxes");
    
    allTags.forEach(tag => {
        const item = tagContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `tag-${tag}`)
            .attr("value", tag)
            .attr("checked", true)
            .on("change", () => {
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            });
        
        item.append("label")
            .attr("for", `tag-${tag}`)
            .text(tag);
    });
}

/**
 * Populate status filter checkboxes
 * @param {Array} data - Game data array
 */
function populateStatusFilters(data) {
    const statuses = [...new Set(data.map(d => d.status))].sort();
    const statusContainer = d3.select("#statusCheckboxes");
    
    statuses.forEach(status => {
        const item = statusContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `status-${status}`)
            .attr("value", status)
            .attr("checked", true)
            .on("change", () => {
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            });
        
        item.append("label")
            .attr("for", `status-${status}`)
            .text(status);
    });
}

/**
 * Populate date range filters
 * @param {Array} data - Game data array
 */
function populateDateFilters(data) {
    // Convert lastPlayedTotal strings to Date objects and find extent
    const dates = data.map(d => new Date(d.lastPlayedTotal)).filter(d => !isNaN(d));
    const dateExtent = d3.extent(dates);
    
    document.getElementById("startDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[0]);
    document.getElementById("endDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[1]);
    
    document.getElementById("startDate").addEventListener("change", () => {
        document.dispatchEvent(new CustomEvent('filtersChanged'));
    });
    document.getElementById("endDate").addEventListener("change", () => {
        document.dispatchEvent(new CustomEvent('filtersChanged'));
    });
}

/**
 * Get filtered data based on current filter selections
 * @returns {Array} Filtered game data
 */
export function getFilteredData() {
    const data = getGameData();
    
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
        // Platform filter (game must have at least one selected platform)
        const platformMatch = selectedPlatforms.length === 0 || d.platforms.some(platform => selectedPlatforms.includes(platform));
        
        // Tag filter (game must have at least one selected tag)
        const tagMatch = selectedTags.length === 0 || d.tags.some(tag => selectedTags.includes(tag));
        
        // Status filter
        const statusMatch = selectedStatuses.includes(d.status);
        
        // Date filter - convert lastPlayedTotal to Date for comparison
        const gameDate = new Date(d.lastPlayedTotal);
        const dateMatch = !isNaN(gameDate) && gameDate >= startDate && gameDate <= endDate;
        
        return platformMatch && tagMatch && statusMatch && dateMatch;
    });
}

/**
 * Clear all platform filters (select all)
 */
export function clearPlatformFilters() {
    document.querySelectorAll('#platformCheckboxes input').forEach(cb => cb.checked = true);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Clear all tag filters (select all)
 */
export function clearTagFilters() {
    document.querySelectorAll('#tagCheckboxes input').forEach(cb => cb.checked = true);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Clear all status filters (select all)
 */
export function clearStatusFilters() {
    document.querySelectorAll('#statusCheckboxes input').forEach(cb => cb.checked = true);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Clear date filter (reset to full range)
 */
export function clearDateFilter() {
    const data = getGameData();
    // Convert lastPlayedTotal strings to Date objects and find extent
    const dates = data.map(d => new Date(d.lastPlayedTotal)).filter(d => !isNaN(d));
    const dateExtent = d3.extent(dates);
    
    document.getElementById("startDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[0]);
    document.getElementById("endDate").value = d3.timeFormat("%Y-%m-%d")(dateExtent[1]);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
} 