#!/usr/bin/env python3

DESC = """
Master data processing script that orchestrates processing of raw game data.

This script:
1. Takes raw data produced by src/scrape-data.py
2. Applies processing steps in sequence: GOG annotations, platform merging, and manual annotations
3. Provides consistent logging and error handling across all processing steps
4. Produces a final output file ready for visualization
"""

#==============================================================================
# Imports
#==============================================================================

import argparse
import logging
import time
from pathlib import Path
from typing import List

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

# Project paths
PROCESS_DIR = PROJECT_ROOT / "src" / "process"

# Expected input files from scraping
EXPECTED_INPUTS = {
    "steam": "steam-games.json",
    "gog": "gog-games-raw.json", 
    "psn-uk": "psn-games-uk.json",
    "psn-us": "psn-games-us.json",
    "xbox": "xbox-games.json"
}

# Description epilog
DESC_EPILOG = """
Examples:
  python src/process-data.py
  python src/process-data.py --skip gog-annotations
  python src/process-data.py --skip platform-merge annotate-games

Directory structure:
- Input: data/games-raw/ (from scraping script)
- Manual files: data/manual/ (GOG annotations, game annotations)
- Output: data/games-processed/ (processed games ready for visualization)

Note: This script expects the raw data files to be present in data/games-raw/
from running the scraping script first.
"""

#==============================================================================
# Processing functions
#==============================================================================

def process_gog_annotations() -> None:
    """Process GOG data with manual annotations."""
    logger.info("Starting GOG annotations processing")
    command = [
        "python",
        str(PROCESS_DIR / "merge-gog-annotations.py"),
        "--gog-games", str(RAW_DATA_DIR / EXPECTED_INPUTS["gog"]),
        "--annotations", str(MANUAL_DATA_DIR / "gog-annotations.json"),
        "--output", str(PROCESSED_DATA_DIR / "gog-games-annotated.json")
    ]
    run_command(command, "GOG annotations processing")
    logger.info("GOG annotations processing completed")

def process_platform_merge() -> None:
    """Merge data across all platforms."""
    logger.info("Starting platform merge processing")
    # Build list of input files, excluding GOG initially
    input_files = [
        str(RAW_DATA_DIR / filename)
        for platform, filename in EXPECTED_INPUTS.items()
        if platform != "gog"  # We'll handle GOG separately
    ]
    # Add GOG file - use annotated version if it exists, otherwise use raw
    gog_annotated = PROCESSED_DATA_DIR / "gog-games-annotated.json"
    if gog_annotated.exists():
        input_files.append(str(gog_annotated))
        logger.info("Using annotated GOG data")
    else:
        input_files.append(str(RAW_DATA_DIR / EXPECTED_INPUTS["gog"]))
        logger.warning("Using raw GOG data (no annotations found)")
    
    command = [
        "python",
        str(PROCESS_DIR / "merge-platforms.py"),
        "--output", str(PROCESSED_DATA_DIR / "merged-platforms.json")
    ] + input_files
    
    run_command(command, "Platform merge processing")
    logger.info("Platform merge processing completed")

def process_annotations() -> None:
    """Add manual annotations to merged data."""
    logger.info("Starting manual annotations processing")
    command = [
        "python",
        str(PROCESS_DIR / "annotate-games.py"),
        "--platform-data", str(PROCESSED_DATA_DIR / "merged-platforms.json"),
        "--annotations", str(MANUAL_DATA_DIR / "annotations.json"),
        "--output", str(PROCESSED_DATA_DIR / "annotated-games.json"),
        "--blank-annotations", str(MANUAL_DATA_DIR / "blank-annotations.json")
    ]
    run_command(command, "Manual annotations processing")
    logger.info("Manual annotations processing completed")

#==============================================================================
# Pipeline functions
#==============================================================================

def run_processing_pipeline(skip_steps: List[str]) -> None:
    """
    Run all processing scripts in sequence.
    Args:
        skip_steps: List of processing steps to skip
    """
    if "gog-annotations" not in skip_steps:
        process_gog_annotations()
    if "platform-merge" not in skip_steps:
        process_platform_merge()
    if "annotate-games" not in skip_steps:
        process_annotations()

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
        "--skip", "-s",
        nargs="*",
        choices=["gog-annotations", "platform-merge", "annotate-games"],
        default=[],
        help="Skip specific processing steps (useful for testing)"
    )
    return parser.parse_args()

#==============================================================================
# Main function
#==============================================================================

def main():
    """Command line interface"""
    # Set up logging first
    setup_logging()
    
    logger.info("Initializing master data processing script.")
    start_time = time.time()
    
    # Parse arguments
    logger.info("Parsing arguments.")
    args = parse_args()
    logger.info(f"Project root: {PROJECT_ROOT}")
    logger.info(f"Raw data directory: {RAW_DATA_DIR}")
    logger.info(f"Processed data directory: {PROCESSED_DATA_DIR}")
    logger.info(f"Manual data directory: {MANUAL_DATA_DIR}")
    if args.skip:
        logger.info(f"Skipping steps: {', '.join(args.skip)}")
    # Ensure output directories exist
    ensure_directory(PROCESSED_DATA_DIR)
    ensure_directory(MANUAL_DATA_DIR)
    # Verify input files
    files_to_check = []
    if "gog-annotations" not in args.skip:
        files_to_check.append(RAW_DATA_DIR / EXPECTED_INPUTS["gog"])
    if "platform-merge" not in args.skip:
        files_to_check.extend(RAW_DATA_DIR / filename for filename in EXPECTED_INPUTS.values())
    if files_to_check:
        verify_files(files_to_check, "input files")
    
    # Run processing pipeline
    logger.info("Starting data processing pipeline")
    run_processing_pipeline(args.skip)
    
    logger.info("Data processing pipeline completed successfully")
    logger.info(f"Final output available in: {PROCESSED_DATA_DIR / 'annotated-games.json'}")
    end_time = time.time()
    logger.info(f"Total time elapsed: {round(end_time - start_time, 1)} seconds")

if __name__ == "__main__":
    main() 