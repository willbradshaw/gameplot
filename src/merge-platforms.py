#!/usr/bin/env python3
"""
Merge game data across platforms.
"""

#==============================================================================
# Imports
#==============================================================================

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

#==============================================================================
# Configure logging
#==============================================================================

class UTCFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, timezone.utc)
        return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
handler = logging.StreamHandler()
formatter = UTCFormatter('[%(asctime)s] %(message)s')
handler.setFormatter(formatter)
logger.handlers.clear()
logger.addHandler(handler)

#==============================================================================
# I/O Functions
#==============================================================================

def parse_args() -> argparse.Namespace:
    """Parse command line arguments"""
    epilog_text = """
        Example:
            python src/merge-platforms.py -o output.json file1.json file2.json ...
        """
    parser = argparse.ArgumentParser(
        description="Merge game data across platforms",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=epilog_text
    )
    parser.add_argument(
        '-o', '--output',
        default='data/merged-platforms.json',
        help='Path for merged output JSON file (default: data/merged-platforms.json)'
    )
    parser.add_argument(
        'input_files',
        nargs='+',
        help='Paths to input JSON files',
    )
    return parser.parse_args()

def parse_platform_file(platform_file: str) -> dict[str, dict[str, object]]:
    """
    Parses a single platform JSON file and returns a dictionary of game dictionaries.
    Args:
        platform_file: Path to platform games JSON file
    Returns:
        Dictionary of game dictionaries, keyed by game name.
    """
    logger.info(f"Parsing platform games file: {platform_file}")
    # Read raw JSON into list
    with open(platform_file, 'r', encoding='utf-8') as f:
        platform_raw = json.load(f)
    # Check that all entries have a unique ID
    ids = [game['id'] for game in platform_raw]
    assert len(ids) == len(set(ids)), f"Duplicate IDs found in {platform_file}"
    # Convert to dictionary of game dictionaries
    platform_dict = {game['game']: game for game in platform_raw}
    # Drop "game" key from each game dictionary (now keyed by game name)
    for game in platform_dict.values():
        del game['game']
    logger.info(f"Parsed {len(platform_dict)} games from platform games file")
    return platform_dict

def write_merged_games(merged_games: dict[str, dict[str, object]],
                       output_file: str) -> None:
    """
    Writes the merged games data to a JSON file.
    Args:
        merged_games: Dictionary of merged game dictionaries, keyed by game name.
        output_file: Path for merged output file
    """
    # Convert output object to list of dictionaries
    output_list = []
    for game, data in merged_games.items():
        output_dict = data.copy()
        output_dict['game'] = game
        output_list.append(output_dict)
    # Write output list to JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_list, f, indent=2, ensure_ascii=False)
    logger.info(f"Merged data written to {output_file}")

#==============================================================================
# Merging functions
#==============================================================================

def merge_platform(merged_games: dict[str, dict[str, object]] | None,
                   platform_dict: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    """
    Merges a single platform's game data into the merged games dictionary.
    Args:
        merged_games: Dictionary of merged game dictionaries, keyed by game name,
            or None if this is the first platform.
        platform_dict: Dictionary of platform game dictionaries, keyed by game name.
    Returns:
        Dictionary of merged game dictionaries, keyed by game name.
    """
    logger.debug(f"Merging {len(platform_dict)} games from platform")
    output_dict = defaultdict(dict) if merged_games is None else merged_games
    for game_name, game_data in platform_dict.items():
        logger.debug(f"Processing game: {game_name}")
        if merged_games is None or game_name not in merged_games:
            logger.debug(f"First platform entry for game: {game_name}")
            logger.debug(f"New entry: {game_data}")
            # If this is the first platform for this game, format as a new entry
            output_dict[game_name]["platforms"] = [game_data["platform"]]
            output_dict[game_name]["lastPlayedSingle"] = [game_data["lastPlayed"]]
            output_dict[game_name]["lastPlayedTotal"] = game_data["lastPlayed"]
            output_dict[game_name]["hoursPlayedSingle"] = [game_data["hoursPlayed"]]
            output_dict[game_name]["hoursPlayedTotal"] = game_data["hoursPlayed"]
            output_dict[game_name]["ids"] = [game_data["id"]]
            output_dict[game_name]["urls"] = [game_data["url"]]
            logger.debug(f"Updated entry: {output_dict[game_name]}")
        else:
            logger.debug(f"Adding {game_name} data to existing entry")
            logger.debug(f"Existing entry: {merged_games[game_name]}")
            logger.debug(f"New entry: {game_data}")
            # If platform is already in the list, verify that non-player data is the same
            if game_data["platform"] in merged_games[game_name]["platforms"]:
                logger.debug(f"Platform {game_data['platform']} already in list")
                platform_idx = merged_games[game_name]["platforms"].index(game_data["platform"])
                assert merged_games[game_name]["ids"][platform_idx] == game_data["id"]
                assert merged_games[game_name]["urls"][platform_idx] == game_data["url"]
                output_dict[game_name]["hoursPlayedSingle"][platform_idx] += game_data["hoursPlayed"]
                output_dict[game_name]["lastPlayedSingle"][platform_idx] = get_most_recent_date(
                    merged_games[game_name]["lastPlayedSingle"][platform_idx],
                    game_data["lastPlayed"],
                )
            else:
                logger.debug(f"Platform {game_data['platform']} not in list")
                output_dict[game_name]["platforms"].append(game_data["platform"])
                output_dict[game_name]["ids"].append(game_data["id"])
                output_dict[game_name]["urls"].append(game_data["url"])
                output_dict[game_name]["hoursPlayedSingle"].append(game_data["hoursPlayed"])
                output_dict[game_name]["lastPlayedSingle"].append(game_data["lastPlayed"])
            output_dict[game_name]["lastPlayedTotal"] = get_most_recent_date(
                merged_games[game_name]["lastPlayedTotal"],
                game_data["lastPlayed"],
            )
            output_dict[game_name]["hoursPlayedTotal"] += game_data["hoursPlayed"]
            logger.debug(f"Updated entry: {output_dict[game_name]}")
    return output_dict

def get_most_recent_date(date1: str, date2: str) -> str:
    """
    Compares two date strings and returns the most recent one.
    Args:
        date1: First date string in YYYY-MM-DD format
        date2: Second date string in YYYY-MM-DD format
    Returns:
        The most recent date string
    """
    parsed_date1 = datetime.strptime(date1, '%Y-%m-%d')
    parsed_date2 = datetime.strptime(date2, '%Y-%m-%d')
    if parsed_date1 >= parsed_date2:
        return date1
    else:
        return date2

#==============================================================================
# Main function
#==============================================================================

def main():
    """Main entry point"""
    logger.info("Initializing script.")
    start_time = time.time()
    # Parse arguments
    logger.info("Parsing arguments.")
    args = parse_args()
    logger.info(f"Input files: {args.input_files}")
    logger.info(f"Output file: {args.output}")
    # Parse input files
    logger.info("Parsing input files.")
    platforms = [
        parse_platform_file(platform_file)
        for platform_file in args.input_files
    ]
    logger.info(f"Parsed {len(platforms)} platform files")
    # Merge games data
    logger.info("Merging games data.")
    merged_games = None
    for platform in platforms:
        merged_games = merge_platform(merged_games, platform)
    logger.info(f"Merged {len(merged_games)} games")
    # Write output file
    logger.info("Writing output file.")
    write_merged_games(merged_games, args.output)
    logger.info("Script completed successfully.")
    end_time = time.time()
    logger.info(f"Total time elapsed: {end_time - start_time} seconds")

if __name__ == "__main__":
    main() 