#!/usr/bin/env python3

DESC = """
Master data scraping script that orchestrates scraping of all platforms.

This script:
1. Reads API keys and configuration from a JSON file
2. Runs all scraping scripts in sequence to generate raw data files
3. Provides consistent logging and error handling across all scrapers
4. Handles special cases like running PSN scraper for both UK and US regions

Requires Node.js for JavaScript scrapers and Python 3 for Xbox scraper.
"""

#==============================================================================
# Imports
#==============================================================================

import argparse
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

# Import shared functionality
from aux import (
    setup_logging, run_command, ensure_directory, verify_files,
    PROJECT_ROOT, DATA_DIR, RAW_DATA_DIR
)

# Module-level logger
logger = logging.getLogger(__name__)

#==============================================================================
# Constants
#==============================================================================

# Project paths
SCRAPE_DIR = PROJECT_ROOT / "src" / "scrape"
DEFAULT_CONFIG_FILE = DATA_DIR / "scraper-config.json"
TIMESTAMP_FILE = DATA_DIR / "last-updated.json"

# Expected output files for each scraper
EXPECTED_OUTPUTS = {
    "steam": "steam-games.json",
    "gog": "gog-games-raw.json", 
    "psn-uk": "psn-games-uk.json",
    "psn-us": "psn-games-us.json",
    "xbox": "xbox-games.json"
}

# Description epilog
DESC_EPILOG = """
Examples:
  python src/prepare-data.py
  python src/prepare-data.py --config my-keys.json
  python src/prepare-data.py --skip steam xbox

Configuration file format (JSON):
{
    "steam": {
        "api_key": "YOUR_STEAM_API_KEY",
        "steam_id": "YOUR_STEAM_ID"
    },
    "xbox": {
        "api_key": "YOUR_OPENXBL_API_KEY"
    }
}

Note: PSN and GOG use interactive authentication - no keys needed.
"""

#==============================================================================
# Configuration functions
#==============================================================================

def load_config(config_file: Path) -> dict[str, dict[str, str]]:
    """
    Load configuration from JSON file.
    Args:
        config_file (Path): Path to configuration JSON file
    Returns:
        dict[str, dict[str, str]]: Configuration dictionary
    """
    if not config_file.exists():
        msg = f"Configuration file not found: {config_file}"
        logger.error(msg)
        raise ValueError(msg)
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        logger.info(f"Loaded configuration from {config_file}")
        return config
    except json.JSONDecodeError as e:
        msg = f"Invalid JSON in config file {config_file}: {e}"
        logger.error(msg)
        raise e
    except Exception as e:
        msg = f"Failed to load config file {config_file}: {e}"
        logger.error(msg)
        raise e

#==============================================================================
# Utility functions
#==============================================================================

def write_timestamp_file() -> None:
    """Write a JSON file with the current timestamp for 'Last Updated' tracking."""
    current_time = datetime.now(timezone.utc)
    timestamp_data = {
        "lastUpdated": current_time.isoformat(),
        "timestamp": int(current_time.timestamp())
    }
    try:
        with open(TIMESTAMP_FILE, 'w') as f:
            json.dump(timestamp_data, f, indent=2)
        logger.info(f"Updated timestamp file: {TIMESTAMP_FILE}")
    except Exception as e:
        logger.warning(f"Failed to write timestamp file: {e}")

#==============================================================================
# Scraping functions
#==============================================================================

def scrape_steam(config: dict[str, dict[str, str]]) -> None:
    """
    Scrape Steam data using the Node.js scraper.
    Args:
        config (dict[str, dict[str, str]]): Configuration dictionary with steam section
    """
    if "steam" not in config:
        msg = "Steam configuration missing from config file"
        logger.error(msg)
        raise ValueError(msg)
    logger.info("Starting Steam data scraping")
    steam_config = config["steam"]
    for key in ["api_key", "steam_id"]:
        assert key in steam_config, f"Missing required Steam config key: {key}"
    command = [
        "node",
        str(SCRAPE_DIR / "steam-scraper.js"),
        steam_config["api_key"],
        steam_config["steam_id"],
        str(RAW_DATA_DIR / EXPECTED_OUTPUTS["steam"])
    ]
    run_command(command, "Steam data scraping", timeout=600)  # 10 minute timeout
    logger.info("Steam data scraping completed")

def scrape_gog() -> None:
    """
    Scrape GOG data using the Node.js scraper with interactive authentication.
    """
    logger.info("Starting GOG data scraping")
    command = [
        "node",
        str(SCRAPE_DIR / "gog-scraper.js"),
        str(RAW_DATA_DIR / EXPECTED_OUTPUTS["gog"])
    ]
    run_command(command, "GOG data scraping", timeout=900)  # 15 minute timeout for interactive auth
    logger.info("GOG data scraping completed")

def scrape_psn(region: Literal["uk", "us"]) -> None:
    """
    Scrape PSN data using the Node.js scraper with interactive authentication.
    Args:
        region (str): Either 'uk' or 'us'
    """
    output_file = RAW_DATA_DIR / EXPECTED_OUTPUTS[f"psn-{region}"]
    logger.info(f"Starting PSN ({region.upper()}) data scraping")
    command = [
        "node", 
        str(SCRAPE_DIR / "psn-scraper.js"),
        str(output_file)
    ]
    run_command(command, f"PSN data scraping ({region.upper()})", timeout=900)  # 15 minute timeout
    logger.info(f"PSN ({region.upper()}) data scraping completed")

def scrape_xbox(config: dict[str, dict[str, str]]) -> None:
    """
    Scrape Xbox data using the Python scraper.
    Args:
        config (dict[str, dict[str, str]]): Configuration dictionary with xbox section
    """
    if "xbox" not in config:
        msg = "Xbox configuration missing from config file"
        logger.error(msg)
        raise ValueError(msg)
    xbox_config = config["xbox"]
    assert "api_key" in xbox_config, "Missing required Xbox config key: api_key"
    command = [
        "python",
        str(SCRAPE_DIR / "xbox-scraper.py"),
        "--api_key", xbox_config["api_key"],
        "--output", str(RAW_DATA_DIR / EXPECTED_OUTPUTS["xbox"])
    ]
    run_command(command, "Xbox data scraping", timeout=600)  # 10 minute timeout
    logger.info("Xbox data scraping completed")

#==============================================================================
# Pipeline functions
#==============================================================================

def run_scraping_pipeline(config: Dict, skip_scrapers: List[str]) -> None:
    """
    Run all scraping scripts in sequence.
    Args:
        config: Configuration dictionary
        skip_scrapers: List of scrapers to skip
    """
    if "steam" not in skip_scrapers:
        scrape_steam(config)
    if "gog" not in skip_scrapers:
        scrape_gog()
    if "psn-uk" not in skip_scrapers and "psn" not in skip_scrapers:
        scrape_psn("uk")
    if "psn-us" not in skip_scrapers and "psn" not in skip_scrapers:
        scrape_psn("us")
    if "xbox" not in skip_scrapers:
        scrape_xbox(config)

#==============================================================================
# I/O functions
#==============================================================================

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description=DESC,
        epilog=DESC_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--config", "-c",
        type=Path,
        default=DEFAULT_CONFIG_FILE,
        help=f"Configuration file path (default: {DEFAULT_CONFIG_FILE})"
    )
    parser.add_argument(
        "--skip", "-s",
        nargs="*",
        choices=["steam", "gog", "psn", "psn-uk", "psn-us", "xbox"],
        default=[],
        help="Skip specific scrapers (useful for testing)"
    )
    return parser.parse_args()

#==============================================================================
# Main function
#==============================================================================

def main():
    """Command line interface"""
    # Set up logging first
    setup_logging()
    logger.info("Initializing master data preparation script.")
    start_time = time.time()
    # Parse arguments
    logger.info("Parsing arguments.")
    args = parse_args()
    logger.info(f"Configuration file: {args.config}")
    logger.info(f"Project root: {PROJECT_ROOT}")
    logger.info(f"Output directory: {RAW_DATA_DIR}")
    if args.skip:
        logger.info(f"Skipping scrapers: {', '.join(args.skip)}")
    logger.info("Starting data preparation pipeline")
    # Load configuration
    config = load_config(args.config)
    # Ensure output directory exists
    ensure_directory(RAW_DATA_DIR)
    # Run scraping pipeline
    run_scraping_pipeline(config, args.skip)
    # Verify all outputs were created
    files_to_check = [
        RAW_DATA_DIR / filename
        for platform, filename in EXPECTED_OUTPUTS.items()
        if platform not in args.skip
    ]
    if files_to_check:
        verify_files(files_to_check, "output files")
    # Write timestamp file for "Last Updated" tracking
    write_timestamp_file()
    logger.info("Data preparation pipeline completed successfully")
    logger.info(f"Output files available in: {RAW_DATA_DIR}")
    end_time = time.time()
    logger.info(f"Total time elapsed: {round(end_time - start_time, 1)} seconds")

if __name__ == "__main__":
    main() 