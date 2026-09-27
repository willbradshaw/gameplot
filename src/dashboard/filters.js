import { getPlatformColor } from './config.js';

export function createFilters(root, data, idPrefix) {
  // Filters module - handles all filter controls and data filtering

  // Store all tags for search functionality
  let allTags = [];

  /**
   * Populate all filter controls with data from the game dataset
   */
  function populateFilters() {
    populatePlatformFilters(data);
    populateTagFilters(data);
    populateStatusFilters(data);
    populateRatingFilters();
    populateDateFilters(data);

    // Set up tag search functionality
    setupTagSearch();
  }

  /**
   * Set up tag search functionality
   */
  function setupTagSearch() {
    const searchInput = root.querySelector('[data-role="tagSearch"]');
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
    const tagItems = root.querySelectorAll('[data-role="tagCheckboxes"] .checkbox-item');
    tagItems.forEach((item) => {
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
    const platforms = [...new Set(data.flatMap((d) => d.platforms))].sort();
    const platformContainer = d3.select(root).select('[data-role="platformCheckboxes"]');

    platforms.forEach((platform) => {
      const item = platformContainer.append('div').attr('class', 'checkbox-item');
      item
        .append('input')
        .attr('type', 'checkbox')
        .attr('id', `${idPrefix}-platform-${encodeURIComponent(platform)}`)
        .attr('value', platform)
        .attr('checked', true)
        .on('change', () => {
          // Trigger update event that main app can listen to
          root.dispatchEvent(new CustomEvent('filtersChanged'));
        });

      item
        .append('label')
        .attr('for', `${idPrefix}-platform-${encodeURIComponent(platform)}`)
        .style('color', getPlatformColor(platform))
        .text(platform);
    });
  }

  /**
   * Populate tag filter checkboxes
   * @param {Array} data - Game data array
   */
  function populateTagFilters(data) {
    allTags = [...new Set(data.flatMap((d) => d.tags))].sort();
    const tagContainer = d3.select(root).select('[data-role="tagCheckboxes"]');

    allTags.forEach((tag) => {
      const item = tagContainer.append('div').attr('class', 'checkbox-item');
      item
        .append('input')
        .attr('type', 'checkbox')
        .attr('id', `${idPrefix}-tag-${encodeURIComponent(tag)}`)
        .attr('value', tag)
        .attr('checked', true)
        .on('change', () => {
          root.dispatchEvent(new CustomEvent('filtersChanged'));
        });

      item
        .append('label')
        .attr('for', `${idPrefix}-tag-${encodeURIComponent(tag)}`)
        .text(tag);
    });
  }

  /**
   * Populate status filter checkboxes
   * @param {Array} data - Game data array
   */
  function populateStatusFilters(data) {
    const statuses = [...new Set(data.map((d) => d.status))].sort();
    const statusContainer = d3.select(root).select('[data-role="statusCheckboxes"]');

    statuses.forEach((status) => {
      const item = statusContainer.append('div').attr('class', 'checkbox-item');
      item
        .append('input')
        .attr('type', 'checkbox')
        .attr('id', `${idPrefix}-status-${encodeURIComponent(status)}`)
        .attr('value', status)
        .attr('checked', true)
        .on('change', () => {
          root.dispatchEvent(new CustomEvent('filtersChanged'));
        });

      item
        .append('label')
        .attr('for', `${idPrefix}-status-${encodeURIComponent(status)}`)
        .text(status);
    });
  }

  /**
   * Populate rating filter checkboxes
   * @param {Array} data - Game data array
   */
  function populateRatingFilters() {
    const ratingRanges = ['<5', '5-6', '6-7', '7-8', '8-9', '9-10'];
    const ratingContainer = d3.select(root).select('[data-role="ratingCheckboxes"]');

    ratingRanges.forEach((range) => {
      const item = ratingContainer.append('div').attr('class', 'checkbox-item');
      item
        .append('input')
        .attr('type', 'checkbox')
        .attr('id', `${idPrefix}-rating-${encodeURIComponent(range)}`)
        .attr('value', range)
        .attr('checked', true)
        .on('change', () => {
          root.dispatchEvent(new CustomEvent('filtersChanged'));
        });

      item
        .append('label')
        .attr('for', `${idPrefix}-rating-${encodeURIComponent(range)}`)
        .text(range);
    });
  }

  // Processed dates are YYYY-MM-DD strings, so their lexical order is chronological.
  function setDateRange(data) {
    const dates = data.map((d) => d.lastPlayedTotal).sort();
    root.querySelector('[data-role="startDate"]').value = dates[0] ?? '';
    root.querySelector('[data-role="endDate"]').value = dates.at(-1) ?? '';
  }

  /**
   * Populate date range filters
   * @param {Array} data - Game data array
   */
  function populateDateFilters(data) {
    setDateRange(data);

    root.querySelector('[data-role="startDate"]').addEventListener('change', () => {
      root.dispatchEvent(new CustomEvent('filtersChanged'));
    });
    root.querySelector('[data-role="endDate"]').addEventListener('change', () => {
      root.dispatchEvent(new CustomEvent('filtersChanged'));
    });
  }

  /**
   * Get filtered data based on current filter selections
   * @returns {Array} Filtered game data
   */
  function getFilteredData() {
    // Get selected platforms
    const selectedPlatforms = Array.from(
      root.querySelectorAll('[data-role="platformCheckboxes"] input:checked'),
    ).map((cb) => cb.value);

    // Get selected tags
    const selectedTags = Array.from(root.querySelectorAll('[data-role="tagCheckboxes"] input:checked')).map(
      (cb) => cb.value,
    );

    // Get selected statuses
    const selectedStatuses = Array.from(
      root.querySelectorAll('[data-role="statusCheckboxes"] input:checked'),
    ).map((cb) => cb.value);

    // Get selected rating ranges
    const selectedRatingRanges = Array.from(
      root.querySelectorAll('[data-role="ratingCheckboxes"] input:checked'),
    ).map((cb) => cb.value);

    // Get date range
    const startDate = root.querySelector('[data-role="startDate"]').value;
    const endDate = root.querySelector('[data-role="endDate"]').value;

    return data.filter((d) => {
      // Platform filter (game must have at least one selected platform)
      const platformMatch = d.platforms.some((platform) => selectedPlatforms.includes(platform));

      // Tag filter (game must have at least one selected tag)
      const tagMatch = d.tags.some((tag) => selectedTags.includes(tag));

      // Status filter
      const statusMatch = selectedStatuses.includes(d.status);

      // Rating filter
      const ratingMatch = selectedRatingRanges.includes(getRatingRange(d.rating));

      const dateMatch =
        (!startDate || d.lastPlayedTotal >= startDate) && (!endDate || d.lastPlayedTotal <= endDate);

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
  function clearPlatformFilters() {
    root.querySelectorAll('[data-role="platformCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Clear all tag filters (uncheck all)
   */
  function clearTagFilters() {
    root.querySelectorAll('[data-role="tagCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Clear all status filters (uncheck all)
   */
  function clearStatusFilters() {
    root.querySelectorAll('[data-role="statusCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Clear all rating filters (uncheck all)
   */
  function clearRatingFilters() {
    root.querySelectorAll('[data-role="ratingCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Clear date filter (reset to full range)
   */
  function clearDateFilter() {
    setDateRange(data);
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Select only specific platform filter
   * @param {string} platform - Platform to select
   */
  function selectOnlyPlatform(platform) {
    // Uncheck all platforms
    root.querySelectorAll('[data-role="platformCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    // Check only the selected platform by finding the checkbox with matching value
    const checkboxes = root.querySelectorAll('[data-role="platformCheckboxes"] input');
    for (const checkbox of checkboxes) {
      if (checkbox.value === platform) {
        checkbox.checked = true;
        root.dispatchEvent(new CustomEvent('filtersChanged'));
        break;
      }
    }
  }

  /**
   * Select only specific tag filter
   * @param {string} tag - Tag to select
   */
  function selectOnlyTag(tag) {
    // Uncheck all tags
    root.querySelectorAll('[data-role="tagCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    // Check only the selected tag by finding the checkbox with matching value
    const checkboxes = root.querySelectorAll('[data-role="tagCheckboxes"] input');
    for (const checkbox of checkboxes) {
      if (checkbox.value === tag) {
        checkbox.checked = true;
        root.dispatchEvent(new CustomEvent('filtersChanged'));
        break;
      }
    }
  }

  /**
   * Select only specific status filter
   * @param {string} status - Status to select
   */
  function selectOnlyStatus(status) {
    // Uncheck all statuses
    root.querySelectorAll('[data-role="statusCheckboxes"] input').forEach((cb) => {
      cb.checked = false;
    });
    // Check only the selected status by finding the checkbox with matching value
    const checkboxes = root.querySelectorAll('[data-role="statusCheckboxes"] input');
    for (const checkbox of checkboxes) {
      if (checkbox.value === status) {
        checkbox.checked = true;
        root.dispatchEvent(new CustomEvent('filtersChanged'));
        break;
      }
    }
  }

  /**
   * Select only a specific rating range (used by table filtering)
   * @param {string} range - Rating range to select
   */
  function selectOnlyRating(range) {
    root.querySelectorAll('[data-role="ratingCheckboxes"] input').forEach((cb) => {
      cb.checked = cb.value === range;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Select all platforms
   */
  function selectAllPlatforms() {
    root.querySelectorAll('[data-role="platformCheckboxes"] input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Select all tags
   */
  function selectAllTags() {
    root.querySelectorAll('[data-role="tagCheckboxes"] input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Select all statuses
   */
  function selectAllStatuses() {
    root.querySelectorAll('[data-role="statusCheckboxes"] input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Select all ratings
   */
  function selectAllRatings() {
    root.querySelectorAll('[data-role="ratingCheckboxes"] input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  /**
   * Reset all filters to their default state
   */
  function resetAllFilters() {
    root.querySelectorAll('.controls input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    setDateRange(data);

    // Clear tag search
    const tagSearch = root.querySelector('[data-role="tagSearch"]');
    if (tagSearch) {
      tagSearch.value = '';
      filterTagDisplay(''); // Show all tags
    }

    root.dispatchEvent(new CustomEvent('filtersChanged'));
  }

  return {
    populateFilters,
    getFilteredData,
    clearPlatformFilters,
    clearTagFilters,
    clearStatusFilters,
    clearRatingFilters,
    clearDateFilter,
    selectOnlyPlatform,
    selectOnlyTag,
    selectOnlyStatus,
    selectOnlyRating,
    selectAllPlatforms,
    selectAllTags,
    selectAllStatuses,
    selectAllRatings,
    resetAllFilters,
  };
}
