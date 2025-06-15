# 🎮 Video Game Journey Dashboard

Interactive dashboard for visualizing your video game playing patterns and preferences.

## Features

- **Games Table** - Sortable, filterable table with search
- **Timeline Chart** - Last played date vs rating scatter plot  
- **Playtime Analysis** - Bar charts by platform, tag, status, and rating
- **Playtime vs Rating** - Hours played vs rating scatter plot
- **Interactive Filters** - Platform, tag, status, rating, and date filters

## Quick Start

1. **Prepare data** - Update files in `data/` directory with your game data

## Data Processing Pipeline

The `src/` directory contains Python scripts for downloading and processing game data:

- `scrape-data.py` - Downloads game data from external sources
- `process-data.py` - Processes and cleans raw game data
- `prepare-data.py` - Orchestrates the previous two scripts in order.

Run the pipeline to update your data:
```bash
python src/prepare-data.py
```

2. **Start a local server**
   ```bash
   python -m http.server 8000
   # Open http://localhost:8000
   ```

## Data Format

The dashboard expects JSON files in the `data/` directory:
- `data/games.json` - Main game data
- `data/last-updated.json` - Last update timestamp

See existing files for format examples.

## Dependencies

- D3.js v7.8.5 (loaded from CDN)
- Modern browser with ES6+ support
- Python 3.x (for data processing scripts)