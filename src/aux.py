#!/usr/bin/env python3
"""
Auxiliary functions for game data processing scripts.
"""

import json
import logging
from datetime import datetime, timezone

#==============================================================================
# Logging setup
#==============================================================================

class UTCFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, timezone.utc)
        return dt.strftime('%Y-%m-%d %H:%M:%S UTC')

def setup_logging(level=logging.INFO):
    """Setup logging with UTC timestamps"""
    logger = logging.getLogger()
    logger.setLevel(level)
    handler = logging.StreamHandler()
    formatter = UTCFormatter('[%(asctime)s] %(message)s')
    handler.setFormatter(formatter)
    logger.handlers.clear()
    logger.addHandler(handler)
    return logger

#==============================================================================
# JSON I/O functions
#==============================================================================

def parse_game_json(file_path: str) -> dict[str, dict]:
    """
    Parse a game JSON file and return a dictionary keyed by game name.
    
    Args:
        file_path: Path to JSON file containing list of game objects
        
    Returns:
        Dictionary of game data, keyed by game name (with 'game' key removed from values)
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        games_list = json.load(f)
    
    # Check for unique game names
    game_names = [game['game'] for game in games_list]
    if len(game_names) != len(set(game_names)):
        # Identify duplicate game names
        duplicates = set([name for name in game_names if game_names.count(name) > 1])
        raise ValueError(f"Duplicate game names found in {file_path}: {duplicates}")
    
    # Convert to dictionary keyed by game name
    games_dict = {game['game']: game for game in games_list}
    
    # Remove 'game' key from each entry (now redundant as it's the dict key)
    for game_data in games_dict.values():
        del game_data['game']
    
    return games_dict

def write_game_json(games_dict: dict[str, dict], output_path: str) -> None:
    """
    Write a dictionary of games to a JSON file.
    
    Args:
        games_dict: Dictionary of game data, keyed by game name
        output_path: Path for output JSON file
    """
    # Convert back to list format with 'game' key
    games_list = []
    for game_name, game_data in games_dict.items():
        entry = game_data.copy()
        entry['game'] = game_name
        games_list.append(entry)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(games_list, f, indent=2, ensure_ascii=False)

#==============================================================================
# Date utilities
#==============================================================================

def get_most_recent_date(date1: str | None, date2: str | None) -> str | None:
    """
    Compare two date strings and return the most recent one.
    
    Args:
        date1: First date string in YYYY-MM-DD format or None
        date2: Second date string in YYYY-MM-DD format or None
        
    Returns:
        The most recent date string, or None if both are None
    """
    if date1 is None and date2 is None:
        return None
    if date1 is None:
        return date2
    if date2 is None:
        return date1
    
    parsed_date1 = datetime.strptime(date1, '%Y-%m-%d')
    parsed_date2 = datetime.strptime(date2, '%Y-%m-%d')
    
    return date1 if parsed_date1 >= parsed_date2 else date2 