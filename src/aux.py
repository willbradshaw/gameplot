#!/usr/bin/env python3
"""
Shared functionality for data processing scripts.
"""

#==============================================================================
# Imports
#==============================================================================

import logging
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List

#==============================================================================
# Constants
#==============================================================================

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "games-raw"
PROCESSED_DATA_DIR = DATA_DIR / "games-processed"
MANUAL_DATA_DIR = DATA_DIR / "manual"

#==============================================================================
# Logging
#==============================================================================

class UTCFormatter(logging.Formatter):
    """Custom formatter that uses UTC timestamps."""
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, timezone.utc)
        return dt.strftime('%Y-%m-%d %H:%M:%S UTC')

def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """
    Set up logging with UTC timestamps.
    Args:
        level: Logging level (default: INFO)
    Returns:
        logging.Logger: Configured logger instance
    """
    logging.basicConfig(level=level)
    logger = logging.getLogger()
    handler = logging.StreamHandler()
    formatter = UTCFormatter('[%(asctime)s] %(message)s')
    handler.setFormatter(formatter)
    logger.handlers.clear()
    logger.addHandler(handler)
    return logger

#==============================================================================
# Command execution
#==============================================================================

def run_command(command: List[str], description: str, timeout: int = 300) -> None:
    """
    Run a shell command with real-time output streaming.
    Args:
        command (List[str]): Command to run as list of strings
        description (str): Human-readable description for logging
        timeout (int): Timeout in seconds (default: 5 minutes)
    """
    logger = logging.getLogger()
    logger.info(f"Starting: {description}")
    logger.debug(f"Command: {' '.join(command)}")
    start_time = time.time()
    try:
        result = subprocess.run(
            command,
            cwd=PROJECT_ROOT,
            timeout=timeout
        )
        end_time = time.time()
        elapsed = round(end_time - start_time, 1)
        if result.returncode != 0:
            msg = f"Command failed with exit code {result.returncode} after {elapsed}s"
            logger.error(msg)
            raise RuntimeError(msg)
        logger.info(f"Command completed successfully after {elapsed}s")
        return
    except subprocess.TimeoutExpired:
        msg = f"Command timed out after {timeout}s: {description}"
        logger.error(msg)
        raise ValueError(msg)
    except FileNotFoundError:
        msg = f"Command not found: {command[0]}"
        logger.error(msg)
        raise ValueError(msg)
    except Exception as e:
        msg = f"Unexpected error running command: {e}"
        logger.error(msg)
        raise e

#==============================================================================
# File operations
#==============================================================================

def ensure_directory(directory: Path) -> None:
    """
    Create a directory if it doesn't exist.
    Args:
        directory (Path): Directory to create
    """
    if not directory.exists():
        directory.mkdir(parents=True, exist_ok=True)
        logger = logging.getLogger()
        logger.info(f"Created directory: {directory}")
    else:
        logger = logging.getLogger()
        logger.info(f"Directory already exists: {directory}")

def verify_files(files: List[Path], description: str) -> None:
    """
    Verify that all required files exist.
    Args:
        files (List[Path]): List of files to check
        description (str): Description of the files for error messages
    """
    missing_files = []
    for file in files:
        if not file.exists():
            missing_files.append(str(file))
    if missing_files:
        msg = f"Missing {description}: {', '.join(missing_files)}"
        logger = logging.getLogger()
        logger.error(msg)
        raise ValueError(msg)
    logger = logging.getLogger()
    logger.info(f"All {description} verified") 