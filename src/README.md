# Game Visualization Dashboard - Source Code Structure

This directory contains the modular JavaScript source code for the game visualization dashboard. The original monolithic `script.js` file has been split into focused, maintainable modules.

## File Structure

### Core Modules

- **`main.js`** - Main application entry point that coordinates all modules
- **`config.js`** - Shared configuration constants (platform colors, zoom settings)
- **`dataLoader.js`** - Handles loading and processing game data from JSON

### Chart Modules

- **`timelineChart.js`** - Main timeline scatter plot (rating vs last played date)
- **`boxplotChart.js`** - Rating distribution boxplots by tag
- **`playtimeChart.js`** - Playtime vs rating scatter plot

### Feature Modules

- **`filters.js`** - Filter controls and data filtering logic
- **`statistics.js`** - Statistics calculation and display

### Data Import Tools

- **`steam-scraper.js`** - Steam Web API scraper for importing playtime data
- **`merge-games.js`** - Utility for merging Steam data with existing games data

## Module Dependencies

```
main.js
├── dataLoader.js
├── timelineChart.js
│   └── config.js
├── boxplotChart.js
├── playtimeChart.js
│   └── config.js
├── filters.js
│   ├── config.js
│   └── dataLoader.js
└── statistics.js
```

## Key Design Principles

1. **Separation of Concerns** - Each module has a single, well-defined responsibility
2. **Configuration Co-location** - Chart-specific config is kept with chart code
3. **Event-Driven Updates** - Filters use custom events to trigger visualization updates
4. **Modular Exports** - Clean public APIs with documented functions
5. **Extensive Documentation** - JSDoc comments for all public functions

## Usage

The application is initialized by loading `main.js` as an ES6 module:

```html
<script type="module" src="src/main.js"></script>
```

The main module handles:
- Loading game data
- Creating initial charts
- Setting up event listeners
- Coordinating updates between modules

## Steam Data Import

The data import tools provide functionality to import your Steam playtime data directly from the Steam Web API and merge it with existing manually-curated game data.

### Prerequisites

1. **Steam Web API Key**: Get one from https://steamcommunity.com/dev/apikey
2. **Steam ID**: Your 64-bit Steam ID (find at https://steamid.io/)
3. **Node.js**: Required to run the scraper

### Step 1: Scrape Steam Data

Use `steam-scraper.js` to fetch your Steam library data:

```bash
node src/steam-scraper.js YOUR_API_KEY YOUR_STEAM_ID [output_file]
```

Example:
```bash
node src/steam-scraper.js ABCDEF1234567890 76561198012345678 steam-games.json
```

### Step 2: Merge with Existing Data (Optional)

Use `merge-games.js` to combine Steam data with your existing games:

```bash
node src/merge-games.js [steam_file] [existing_file] [output_file]
```

Example:
```bash
node src/merge-games.js steam-games.json games.json merged-games.json
```

### What the Scraper Does

1. **Fetches Game Library** - Calls Steam's IPlayerService API to get all owned games
2. **Gets Game Details** - Fetches detailed information (names, genres) from Steam store API
3. **Converts Data Format** - Transforms Steam data to match the dashboard's JSON structure
4. **Handles Rate Limiting** - Processes games in batches with delays to avoid API limits
5. **Provides Fallbacks** - Gracefully handles API failures and missing data

### What the Merge Tool Does

1. **Intelligent Matching** - Uses normalized game names to match Steam games with existing entries
2. **Preserves Manual Data** - Keeps your ratings, notes, custom tags, and status fields
3. **Updates Playtime** - Syncs accurate Steam playtime data with existing games
4. **Adds New Games** - Includes Steam games not in your existing collection
5. **Detailed Reporting** - Shows exactly what was added, updated, or preserved

### Output Format

Both tools generate JSON in the exact format expected by the dashboard:

```json
{
  "game": "Game Name",
  "platform": "Steam",
  "lastPlayed": "2023-12-01",
  "hoursPlayed": 42.5,
  "tags": ["Action", "RPG"],
  "rating": null,
  "firstPlayed": null,
  "status": "Played",
  "notes": "Imported from Steam. App ID: 123456"
}
```

### Data Mapping

| Steam API Field | Dashboard Field | Notes |
|-----------------|----------------|-------|
| `name` | `game` | Game title |
| `playtime_forever` | `hoursPlayed` | Converted from minutes to hours |
| `rtime_last_played` | `lastPlayed` | Unix timestamp → YYYY-MM-DD |
| `genres` | `tags` | Steam genres added as tags |
| `appid` | `notes` | App ID included for reference |

### Important Notes

- **Steam Profile Privacy**: Your Steam profile must be public for the API to work
- **Rate Limiting**: The scraper includes delays but Steam may still rate limit large libraries
- **Manual Fields**: Rating, firstPlayed, and detailed status need to be added manually
- **Filtering**: Only games with playtime > 0 are included
- **Smart Merging**: The merge tool handles game name variations and edition differences

### Workflow Recommendations

1. **First Time**: Run the scraper to get your Steam data, then manually add ratings and notes
2. **Updates**: Use the merge tool to sync new Steam playtime while preserving your manual data
3. **Backup**: Always backup your existing games.json before merging

## Benefits of This Structure

- **Maintainability** - Easier to find and modify specific functionality
- **Readability** - Smaller, focused files are easier to understand
- **Testability** - Individual modules can be tested in isolation
- **Reusability** - Chart modules can be reused in other projects
- **Collaboration** - Multiple developers can work on different modules simultaneously
- **Data Import** - Automated Steam data import reduces manual data entry 