export function createGamesTable(root) {
  // Games table module - handles table rendering, sorting, and CSV export

  let currentData = [];
  let sortColumn = 'rating';
  let sortDirection = 'desc';
  let searchTerm = '';
  let searchTimeout;

  /**
   * Render the games table with the provided data
   * @param {Array} data - Array of game objects
   */
  function renderTable(data) {
    currentData = data;

    // Apply search filter
    const filteredData = applySearchFilter(data);

    const tableBody = root.querySelector('[data-role="gamesTableBody"]');
    const tableRowCount = root.querySelector('[data-role="tableRowCount"]');

    if (!tableBody) {
      console.error('Table body element not found');
      return;
    }

    // Sort the filtered data
    const sortedData = sortData(filteredData, sortColumn, sortDirection);

    // Clear existing rows
    tableBody.innerHTML = '';

    // Populate table rows
    sortedData.forEach((game) => {
      const row = createTableRow(game);
      tableBody.appendChild(row);
    });

    // Update row count
    const totalCount = data.length;
    const filteredCount = filteredData.length;

    if (searchTerm && filteredCount !== totalCount) {
      tableRowCount.textContent = `Showing ${filteredCount} of ${totalCount} games (filtered by search)`;
    } else {
      tableRowCount.textContent = `Showing ${filteredCount} games`;
    }

    // Update sort indicators
    updateSortIndicators();

    console.log(`📋 Table updated with ${filteredCount} games (search: "${searchTerm}")`);
  }

  /**
   * Apply search filter to data
   * @param {Array} data - Array of game objects
   * @returns {Array} Filtered data
   */
  function applySearchFilter(data) {
    if (!searchTerm.trim()) {
      return data;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    return data.filter((game) => game.game.toLowerCase().includes(searchLower));
  }

  /**
   * Handle search input changes
   * @param {string} term - Search term
   */
  function setSearchTerm(term) {
    clearTimeout(searchTimeout);
    searchTerm = term;
    // Re-render table with current data and new search term
    renderTable(currentData);
  }

  /**
   * Clear search term and re-render table
   */
  function clearSearch() {
    const searchInput = root.querySelector('[data-role="gameSearch"]');
    if (searchInput) {
      searchInput.value = '';
    }
    clearTimeout(searchTimeout);
    setSearchTerm('');
  }

  /**
   * Initialize table search functionality
   */
  function initializeTableSearch() {
    const searchInput = root.querySelector('[data-role="gameSearch"]');

    if (searchInput) {
      // Handle input changes with debouncing
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          setSearchTerm(e.target.value);
        }, 300); // 300ms debounce
      });

      // Handle Enter key
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(searchTimeout);
          setSearchTerm(e.target.value);
        }
      });
    }
  }

  /**
   * Initialize table sorting event listeners
   */
  function initializeTableSorting() {
    const headers = root.querySelectorAll('.games-table th.sortable');

    headers.forEach((header) => {
      header.addEventListener('click', () => {
        const column = header.dataset.column;

        // Toggle direction if same column, otherwise reset to ascending
        if (sortColumn === column) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = column;
          sortDirection = 'asc';
        }

        // Re-render table with current data
        renderTable(currentData);
      });
    });
  }

  /**
   * Create a table row for a game
   * @param {Object} game - Game object
   * @returns {HTMLElement} Table row element
   */
  function createTableRow(game) {
    const row = root.ownerDocument.createElement('tr');
    row.addEventListener('click', (event) => {
      const badge = event.target.closest('[data-filter-type]');
      if (badge) {
        root.dispatchEvent(
          new CustomEvent('tableFilterRequested', {
            detail: { type: badge.dataset.filterType, value: badge.dataset.filterValue },
          }),
        );
      }
    });

    // Game name with link
    const gameCell = root.ownerDocument.createElement('td');
    if (game.displayUrl) {
      gameCell.innerHTML = `<a href="${game.displayUrl}" target="_blank" class="game-link">${escapeHtml(game.game)}</a>`;
    } else {
      gameCell.innerHTML = `<span class="game-name">${escapeHtml(game.game)}</span>`;
    }
    row.appendChild(gameCell);

    // Platforms
    const platformCell = root.ownerDocument.createElement('td');
    const platformBadges = game.platforms
      .map(
        (platform) =>
          `<span class="platform-badge" data-platform="${escapeHtml(platform)}" data-filter-type="platform" data-filter-value="${escapeHtml(platform)}">${escapeHtml(platform)}</span>`,
      )
      .join('');
    platformCell.innerHTML = `<div class="platform-badges">${platformBadges}</div>`;
    row.appendChild(platformCell);

    // Rating
    const ratingCell = root.ownerDocument.createElement('td');
    ratingCell.className = 'rating-cell';
    if (game.rating !== null && game.rating !== undefined) {
      const ratingClass = getRatingClass(game.rating);
      const ratingRange = getRatingRange(game.rating);
      ratingCell.innerHTML = `<span class="rating-clickable ${ratingClass}" data-filter-type="rating" data-filter-value="${ratingRange}">${game.rating.toFixed(1)}</span>`;
    } else {
      ratingCell.innerHTML = '<span style="color: #9ca3af;">-</span>';
    }
    row.appendChild(ratingCell);

    // Last played
    const lastPlayedCell = root.ownerDocument.createElement('td');
    lastPlayedCell.className = 'date-cell';
    lastPlayedCell.textContent = formatDate(game.lastPlayedTotal);
    row.appendChild(lastPlayedCell);

    // Hours played
    const hoursCell = root.ownerDocument.createElement('td');
    hoursCell.className = 'hours-cell';
    hoursCell.textContent = formatHours(game.hoursPlayedTotal);
    row.appendChild(hoursCell);

    // Status
    const statusCell = root.ownerDocument.createElement('td');
    const statusClass = getStatusClass(game.status);
    statusCell.innerHTML = `<span class="status-badge ${statusClass}" data-filter-type="status" data-filter-value="${escapeHtml(game.status || 'Unknown')}">${escapeHtml(game.status || 'Unknown')}</span>`;
    row.appendChild(statusCell);

    // Tags
    const tagsCell = root.ownerDocument.createElement('td');
    const tagBadges = (game.tags || [])
      .map(
        (tag) =>
          `<span class="tag-badge" data-filter-type="tag" data-filter-value="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`,
      )
      .join('');
    tagsCell.innerHTML = `<div class="tags-list">${tagBadges}</div>`;
    row.appendChild(tagsCell);

    return row;
  }

  /**
   * Sort data by column and direction
   * @param {Array} data - Data to sort
   * @param {string} column - Column to sort by
   * @param {string} direction - 'asc' or 'desc'
   * @returns {Array} Sorted data
   */
  function sortData(data, column, direction) {
    return [...data].sort((a, b) => {
      let aVal = getColumnValue(a, column);
      let bVal = getColumnValue(b, column);

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      // Convert to string for comparison if needed
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;

      return direction === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Get the value for a specific column from a game object
   * @param {Object} game - Game object
   * @param {string} column - Column name
   * @returns {any} Column value
   */
  function getColumnValue(game, column) {
    switch (column) {
      case 'game':
        return game.game;
      case 'platforms':
        return game.platforms.join(', ');
      case 'rating':
        return game.rating || 0;
      case 'lastPlayedTotal':
        return game.lastPlayedTotal;
      case 'hoursPlayedTotal':
        return game.hoursPlayedTotal || 0;
      case 'status':
        return game.status || '';
      case 'tags':
        return (game.tags || []).join(', ');
      default:
        return '';
    }
  }

  /**
   * Update sort indicators in table headers
   */
  function updateSortIndicators() {
    const headers = root.querySelectorAll('.games-table th.sortable');

    headers.forEach((header) => {
      header.classList.remove('sort-asc', 'sort-desc');

      if (header.dataset.column === sortColumn) {
        header.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  /**
   * Download current table data as CSV
   */
  function downloadTableAsCSV() {
    // Apply search filter to current data
    const searchFilteredData = applySearchFilter(currentData);

    if (searchFilteredData.length === 0) {
      alert('No data to export');
      return;
    }

    // Sort data the same way as displayed in table
    const sortedData = sortData(searchFilteredData, sortColumn, sortDirection);

    // Create CSV headers
    const headers = ['Game', 'Platform', 'Rating', 'Last Played', 'Hours Played', 'Status', 'Tags'];

    // Create CSV rows
    const csvRows = [
      headers.join(','),
      ...sortedData.map((game) =>
        [
          escapeCsvField(game.game),
          escapeCsvField(game.platforms.join('; ')),
          game.rating ?? '',
          game.lastPlayedTotal,
          game.hoursPlayedTotal || 0,
          escapeCsvField(game.status || ''),
          escapeCsvField((game.tags || []).join('; ')),
        ].join(','),
      ),
    ];

    // Create and download file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = root.ownerDocument.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);

      // Include search term in filename if applicable
      const filename = searchTerm
        ? `games_table_search_${searchTerm.replace(/[^a-z0-9]/gi, '_')}.csv`
        : 'games_table.csv';
      link.setAttribute('download', filename);

      link.style.visibility = 'hidden';
      root.appendChild(link);
      link.click();
      root.removeChild(link);
      URL.revokeObjectURL(url);
    }

    console.log(
      '📥 CSV downloaded with',
      sortedData.length,
      'games',
      searchTerm ? `(search: "${searchTerm}")` : '',
    );
  }

  /**
   * Utility functions
   */

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeCsvField(field) {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  function getRatingClass(rating) {
    if (rating >= 9.0) return 'rating-very-high'; // 9-10: blue
    if (rating >= 8.0) return 'rating-high'; // 8-9: blue-green
    if (rating >= 7.0) return 'rating-medium'; // 7-8: yellow-green
    if (rating >= 6.0) return 'rating-medium-low'; // 6-7: yellow
    if (rating >= 5.0) return 'rating-low'; // 5-6: orange
    return 'rating-very-low'; // <5: red
  }

  function getRatingRange(rating) {
    if (rating >= 9.0) return '9-10';
    if (rating >= 8.0) return '8-9';
    if (rating >= 7.0) return '7-8';
    if (rating >= 6.0) return '6-7';
    if (rating >= 5.0) return '5-6';
    return '<5';
  }

  function getStatusClass(status) {
    switch (status?.toLowerCase()) {
      case 'complete':
        return 'status-complete';
      case 'active':
        return 'status-active';
      case 'abandoned':
        return 'status-abandoned';
      case 'unplayed':
        return 'status-unplayed';
      default:
        return 'status-unplayed';
    }
  }

  function formatDate(dateString) {
    return dateString ?? '-';
  }

  function formatHours(hours) {
    if (!hours || hours === 0) return '0h';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${Math.round(hours * 10) / 10}h`;
  }

  function destroy() {
    clearTimeout(searchTimeout);
  }

  return {
    renderTable,
    setSearchTerm,
    clearSearch,
    initializeTableSearch,
    initializeTableSorting,
    downloadTableAsCSV,
    destroy,
  };
}
