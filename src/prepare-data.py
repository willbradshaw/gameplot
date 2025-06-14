#!/usr/bin/env python3

DESC = """
Master pipeline script that orchestrates the complete data pipeline.

This script:
1. Runs scrape-data.py to collect raw game data from all platforms
2. Runs process-data.py to process and merge the data with manual annotations
3. Provides end-to-end pipeline execution with consistent logging
4. Handles errors and provides clear feedback on pipeline status

The complete pipeline:
1. Scraping: Raw data collection → data/games-raw/
2. Processing: Data merging and annotation → data/games-processed/
"""

#==============================================================================
# Imports
#==============================================================================

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import List, Optional

# Import shared functionality
from aux import (
    setup_logging, run_command, ensure_directory, verify_files,
    PROJECT_ROOT, DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, MANUAL_DATA_DIR
)

# Module-level logger
logger = logging.getLogger(__name__)

#==============================================================================
# Constants
#==============================================================================

# Script paths
SCRAPE_SCRIPT = PROJECT_ROOT / "src" / "scrape-data.py"
PROCESS_SCRIPT = PROJECT_ROOT / "src" / "process-data.py"
DEFAULT_CONFIG_FILE = DATA_DIR / "scraper-config.json"

# Description epilog
DESC_EPILOG = """
Examples:
  python src/run-pipeline.py
  python src/run-pipeline.py --config my-keys.json
  python src/run-pipeline.py --skip-scraping steam xbox
  python src/run-pipeline.py --skip-processing gog-annotations

Pipeline stages:
1. Scraping: Steam, GOG, PSN (UK/US), Xbox → data/games-raw/
2. Processing: GOG annotations, platform merge, manual annotations → data/games-processed/

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
Manual annotation files should be placed in data/manual/
"""

#==============================================================================
# Pipeline functions
#==============================================================================

def run_scraping_stage(config_file: Path, skip_scrapers: List[str]) -> None:
    """
    Run the data scraping stage.
    Args:
        config_file: Path to configuration file
        skip_scrapers: List of scrapers to skip
    """
    logger.info("="*60)
    logger.info("STAGE 1: DATA SCRAPING")
    logger.info("="*60)
    
    command = ["python", str(SCRAPE_SCRIPT), "--config", str(config_file)]
    if skip_scrapers:
        command.extend(["--skip"] + skip_scrapers)
    
    run_command(command, "Data scraping stage", timeout=3600)  # 1 hour timeout
    logger.info("Data scraping stage completed successfully")

def run_processing_stage(skip_steps: List[str]) -> None:
    """
    Run the data processing stage.
    Args:
        skip_steps: List of processing steps to skip
    """
    logger.info("="*60)
    logger.info("STAGE 2: DATA PROCESSING")
    logger.info("="*60)
    
    command = ["python", str(PROCESS_SCRIPT)]
    if skip_steps:
        command.extend(["--skip"] + skip_steps)
    
    run_command(command, "Data processing stage", timeout=1800)  # 30 minute timeout
    logger.info("Data processing stage completed successfully")

def run_full_pipeline(config_file: Path, skip_scrapers: List[str], skip_processing: List[str], 
                     skip_scraping_stage: bool, skip_processing_stage: bool) -> None:
    """
    Run the complete data pipeline.
    Args:
        config_file: Path to configuration file
        skip_scrapers: List of scrapers to skip
        skip_processing: List of processing steps to skip
        skip_scraping_stage: Whether to skip the entire scraping stage
        skip_processing_stage: Whether to skip the entire processing stage
    """
    if not skip_scraping_stage:
        run_scraping_stage(config_file, skip_scrapers)
    else:
        logger.info("Skipping scraping stage")
    
    if not skip_processing_stage:
        run_processing_stage(skip_processing)
    else:
        logger.info("Skipping processing stage")

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
        "--skip-scraping",
        nargs="*",
        choices=["steam", "gog", "psn", "psn-uk", "psn-us", "xbox"],
        default=[],
        help="Skip specific scrapers in the scraping stage"
    )
    parser.add_argument(
        "--skip-processing",
        nargs="*", 
        choices=["gog-annotations", "platform-merge", "annotate-games"],
        default=[],
        help="Skip specific steps in the processing stage"
    )
    parser.add_argument(
        "--scraping-only",
        action="store_true",
        help="Run only the scraping stage"
    )
    parser.add_argument(
        "--processing-only",
        action="store_true",
        help="Run only the processing stage"
    )
    return parser.parse_args()

#==============================================================================
# Main function
#==============================================================================

def main():
    """Command line interface"""
    # Set up logging first
    setup_logging()
    
    logger.info("Initializing master pipeline script")
    logger.info("="*60)
    pipeline_start_time = time.time()
    
    # Parse arguments
    args = parse_args()
    logger.info(f"Configuration file: {args.config}")
    logger.info(f"Project root: {PROJECT_ROOT}")
    
    # Determine which stages to run
    skip_scraping_stage = args.processing_only
    skip_processing_stage = args.scraping_only
    
    if args.skip_scraping:
        logger.info(f"Skipping scrapers: {', '.join(args.skip_scraping)}")
    if args.skip_processing:
        logger.info(f"Skipping processing steps: {', '.join(args.skip_processing)}")
    
    if skip_scraping_stage:
        logger.info("Running processing stage only")
    elif skip_processing_stage:
        logger.info("Running scraping stage only")
    else:
        logger.info("Running complete pipeline (scraping + processing)")
    
    # Ensure all directories exist
    ensure_directory(RAW_DATA_DIR)
    ensure_directory(PROCESSED_DATA_DIR)
    ensure_directory(MANUAL_DATA_DIR)
    
    try:
        # Run the pipeline
        run_full_pipeline(
            config_file=args.config,
            skip_scrapers=args.skip_scraping,
            skip_processing=args.skip_processing,
            skip_scraping_stage=skip_scraping_stage,
            skip_processing_stage=skip_processing_stage
        )
        
        # Success summary
        logger.info("="*60)
        logger.info("PIPELINE COMPLETED SUCCESSFULLY")
        logger.info("="*60)
        
        if not skip_scraping_stage:
            logger.info(f"Raw data available in: {RAW_DATA_DIR}")
        if not skip_processing_stage:
            logger.info(f"Processed data available in: {PROCESSED_DATA_DIR}")
            logger.info(f"Final output: {PROCESSED_DATA_DIR / 'annotated-games.json'}")
        
        end_time = time.time()
        total_time = round(end_time - pipeline_start_time, 1)
        logger.info(f"Total pipeline time: {total_time} seconds")
        
    except Exception as e:
        logger.error("="*60)
        logger.error("PIPELINE FAILED")
        logger.error("="*60)
        logger.error(f"Error: {e}")
        end_time = time.time()
        total_time = round(end_time - pipeline_start_time, 1)
        logger.error(f"Pipeline failed after {total_time} seconds")
        sys.exit(1)

if __name__ == "__main__":
    main() 