export function dashboardMarkup(idPrefix) {
  return `
        <p data-role="dashboard-message" role="status">Loading game data…</p>
        <div data-role="dashboard-content" hidden>
        <div class="stats" data-role="stats"></div>
        
        <div class="controls">
            <div class="control-section">
                <div class="control-header">
                    <div class="control-title">Platforms</div>
                    <div class="control-buttons">
                        <button type="button" class="filter-btn" data-action="selectAllPlatforms">All</button>
                        <button type="button" class="filter-btn" data-action="clearPlatformFilters">None</button>
                    </div>
                </div>
                <div class="platform-checkboxes" data-role="platformCheckboxes"></div>
            </div>
            
            <div class="control-section">
                <div class="control-header">
                    <div class="control-title">Tags</div>
                    <div class="control-buttons">
                        <button type="button" class="filter-btn" data-action="selectAllTags">All</button>
                        <button type="button" class="filter-btn" data-action="clearTagFilters">None</button>
                    </div>
                </div>
                <div class="tag-search-container">
                    <input aria-label="Search tags" type="text" data-role="tagSearch" placeholder="Search tags..." class="tag-search-input">
                </div>
                <div class="tag-checkboxes" data-role="tagCheckboxes"></div>
            </div>
            
            <div class="control-section">
                <div class="control-header">
                    <div class="control-title">Status</div>
                    <div class="control-buttons">
                        <button type="button" class="filter-btn" data-action="selectAllStatuses">All</button>
                        <button type="button" class="filter-btn" data-action="clearStatusFilters">None</button>
                    </div>
                </div>
                <div class="platform-checkboxes" data-role="statusCheckboxes"></div>
            </div>
            
            <div class="control-section">
                <div class="control-header">
                    <div class="control-title">Ratings</div>
                    <div class="control-buttons">
                        <button type="button" class="filter-btn" data-action="selectAllRatings">All</button>
                        <button type="button" class="filter-btn" data-action="clearRatingFilters">None</button>
                    </div>
                </div>
                <div class="platform-checkboxes" data-role="ratingCheckboxes"></div>
            </div>
            
            <div class="control-section">
                <div class="control-header">
                    <div class="control-title">Date Range</div>
                    <div class="control-buttons">
                        <button type="button" class="filter-btn" data-action="clearDateFilter">Reset</button>
                    </div>
                </div>
                <div class="date-range">
                    <div class="date-input-group">
                        <label for="${idPrefix}-startDate">From</label>
                        <input type="date" data-role="startDate" id="${idPrefix}-startDate">
                    </div>
                    <div class="date-input-group">
                        <label for="${idPrefix}-endDate">To</label>
                        <input type="date" data-role="endDate" id="${idPrefix}-endDate">
                    </div>
                </div>
            </div>
            
            <div class="control-section reset-section">
                <button type="button" class="reset-all-btn" data-action="resetAllFilters">🔄 Reset All Filters</button>
            </div>
        </div>

        <div class="table-container">
            <div class="table-header">
                <div class="table-controls">
                    <div class="search-container">
                        <input aria-label="Search games" type="text" data-role="gameSearch" placeholder="Search games..." class="search-input">
                        <button type="button" class="clear-search-btn" data-action="clearGameSearch" title="Clear search">✕</button>
                    </div>
                    <button type="button" class="download-csv-btn" data-action="downloadTableAsCSV">📥 Download CSV</button>
                </div>
            </div>
            <div class="table-wrapper">
                <table data-role="gamesTable" class="games-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-column="game">Game <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="platforms">Platforms <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="rating">Rating <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="lastPlayedTotal">Last Played <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="hoursPlayedTotal">Hours Played <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="status">Status <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="tags">Tags <span class="sort-indicator"></span></th>
                        </tr>
                    </thead>
                    <tbody data-role="gamesTableBody">
                        <!-- Table rows will be populated by JavaScript -->
                    </tbody>
                </table>
            </div>
            <div class="table-info">
                <span data-role="tableRowCount">Loading...</span>
            </div>
        </div>

        <div class="chart-container">
            <h2>Last Played vs Rating</h2>
            <div class="chart" data-role="chart"></div>
            <div class="zoom-instructions">
                Scroll to zoom • Click and drag to pan • Hover over points for details
            </div>
        </div>

        <div class="chart-container">
            <h2>Playtime by Category</h2>
            <div class="aggregation-controls" data-role="playtimeAggregationControls">
                <!-- Aggregation type buttons will be populated by JavaScript -->
            </div>
            <div class="chart" data-role="playtimeAggregationChart"></div>
            <div class="zoom-instructions">
                Total playtime aggregated by category • Switch between Platform, Tag, Status, and Rating views • Hover over bars for details
            </div>
        </div>

        <div class="chart-container">
            <h2>Playtime vs Rating</h2>
            <div class="chart" data-role="playtimeChart"></div>
            <div class="zoom-instructions">
                Playtime vs rating relationship • Scroll to zoom • Click and drag to pan • Hover over points for details
            </div>
        </div>
        </div>
<div class="tooltip" data-role="tooltip"></div>
`;
}
