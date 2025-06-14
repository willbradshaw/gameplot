// Filters module - handles all filter controls and data filtering

import { getPlatformColor } from './config.js';
import { getGameData } from './dataLoader.js';

// Store all tags for search functionality
let allTags = [];

/**
 * Populate all filter controls with data from the game dataset
 */
export function populateFilters() {
    const data = getGameData();
    
    populatePlatformFilters(data);
    populateTagFilters(data);
    populateStatusFilters(data);
    populateRatingFilters(data);
    populateDateFilters(data);
    
    // Set up tag search functionality
    setupTagSearch();
}

/**
 * Set up tag search functionality
 */
function setupTagSearch() {
    const searchInput = document.getElementById('tagSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterTagDisplay(e.target.value.toLowerCase());
        });
    }
}

/**
 * Filter tag display based on search term
 * @param {string} searchTerm - Search term
 */
function filterTagDisplay(searchTerm) {
    const tagItems = document.querySelectorAll('#tagCheckboxes .checkbox-item');
    tagItems.forEach(item => {
        const label = item.querySelector('label');
        const tagName = label.textContent.toLowerCase();
        if (tagName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
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
    allTags = [...new Set(data.flatMap(d => d.tags))].sort();
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
 * Populate rating filter checkboxes
 * @param {Array} data - Game data array
 */
function populateRatingFilters(data) {
    const ratingRanges = ['<5', '5-6', '6-7', '7-8', '8-9', '9-10'];
    const ratingContainer = d3.select("#ratingCheckboxes");
    
    ratingRanges.forEach(range => {
        const item = ratingContainer.append("div").attr("class", "checkbox-item");
        const checkbox = item.append("input")
            .attr("type", "checkbox")
            .attr("id", `rating-${range}`)
            .attr("value", range)
            .attr("checked", true)
            .on("change", () => {
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            });
        
        item.append("label")
            .attr("for", `rating-${range}`)
            .text(range);
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
    
    // Get selected rating ranges
    const selectedRatingRanges = Array.from(document.querySelectorAll('#ratingCheckboxes input:checked'))
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
        
        // Rating filter
        const ratingMatch = selectedRatingRanges.length === 0 || 
            selectedRatingRanges.includes(getRatingRange(d.rating));
        
        // Date filter - convert lastPlayedTotal to Date for comparison
        const gameDate = new Date(d.lastPlayedTotal);
        const dateMatch = !isNaN(gameDate) && gameDate >= startDate && gameDate <= endDate;
        
        return platformMatch && tagMatch && statusMatch && ratingMatch && dateMatch;
    });
}

/**
 * Get rating range for a numeric rating
 * @param {number} rating - Numeric rating
 * @returns {string} Rating range string
 */
function getRatingRange(rating) {
    if (rating === null || rating === undefined) return null;
    if (rating >= 9.0) return '9-10';
    if (rating >= 8.0) return '8-9';
    if (rating >= 7.0) return '7-8';
    if (rating >= 6.0) return '6-7';
    if (rating >= 5.0) return '5-6';
    return '<5';
}

/**
 * Clear all platform filters (uncheck all)
 */
export function clearPlatformFilters() {
    document.querySelectorAll('#platformCheckboxes input').forEach(cb => cb.checked = false);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Clear all tag filters (uncheck all)
 */
export function clearTagFilters() {
    document.querySelectorAll('#tagCheckboxes input').forEach(cb => cb.checked = false);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Clear all status filters (uncheck all)
 */
export function clearStatusFilters() {
    document.querySelectorAll('#statusCheckboxes input').forEach(cb => cb.checked = false);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Clear all rating filters (uncheck all)
 */
export function clearRatingFilters() {
    document.querySelectorAll('#ratingCheckboxes input').forEach(cb => cb.checked = false);
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

/**
 * Select only specific platform filter
 * @param {string} platform - Platform to select
 */
export function selectOnlyPlatform(platform) {
    // Uncheck all platforms
    document.querySelectorAll('#platformCheckboxes input').forEach(cb => cb.checked = false);
    // Check only the selected platform by finding the checkbox with matching value
    const checkboxes = document.querySelectorAll('#platformCheckboxes input');
    for (const checkbox of checkboxes) {
        if (checkbox.value === platform) {
            checkbox.checked = true;
            document.dispatchEvent(new CustomEvent('filtersChanged'));
            break;
        }
    }
}

/**
 * Select only specific tag filter
 * @param {string} tag - Tag to select
 */
export function selectOnlyTag(tag) {
    // Uncheck all tags
    document.querySelectorAll('#tagCheckboxes input').forEach(cb => cb.checked = false);
    // Check only the selected tag by finding the checkbox with matching value
    const checkboxes = document.querySelectorAll('#tagCheckboxes input');
    for (const checkbox of checkboxes) {
        if (checkbox.value === tag) {
            checkbox.checked = true;
            document.dispatchEvent(new CustomEvent('filtersChanged'));
            break;
        }
    }
}

/**
 * Select only specific status filter
 * @param {string} status - Status to select
 */
export function selectOnlyStatus(status) {
    // Uncheck all statuses
    document.querySelectorAll('#statusCheckboxes input').forEach(cb => cb.checked = false);
    // Check only the selected status by finding the checkbox with matching value
    const checkboxes = document.querySelectorAll('#statusCheckboxes input');
    for (const checkbox of checkboxes) {
        if (checkbox.value === status) {
            checkbox.checked = true;
            document.dispatchEvent(new CustomEvent('filtersChanged'));
            break;
        }
    }
}

/**
 * Select only a specific rating range (used by table filtering)
 * @param {string} range - Rating range to select
 */
export function selectOnlyRating(range) {
    // First clear all ratings
    document.querySelectorAll('#ratingCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    // Then select only the specified rating
    const targetCheckbox = document.querySelector(`#rating-${range}`);
    if (targetCheckbox) {
        targetCheckbox.checked = true;
    }
    
    // Trigger filter update
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Select all platforms
 */
export function selectAllPlatforms() {
    document.querySelectorAll('#platformCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Select all tags
 */
export function selectAllTags() {
    document.querySelectorAll('#tagCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Select all statuses
 */
export function selectAllStatuses() {
    document.querySelectorAll('#statusCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Select all ratings
 */
export function selectAllRatings() {
    document.querySelectorAll('#ratingCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

/**
 * Reset all filters to their default state
 */
export function resetAllFilters() {
    // Select all checkboxes
    selectAllPlatforms();
    selectAllTags();
    selectAllStatuses();
    selectAllRatings();
    
    // Reset date range to full extent
    clearDateFilter();
    
    // Clear tag search
    const tagSearch = document.getElementById('tagSearch');
    if (tagSearch) {
        tagSearch.value = '';
        filterTagDisplay(''); // Show all tags
    }
    
    console.log('🔄 All filters reset to default');
} 