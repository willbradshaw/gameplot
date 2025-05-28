#!/usr/bin/env python3
"""
Merges Steam-scraped games with manual data (including ratings)
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
        Examples:
            python src/merge-games.py
            python src/merge-games.py --steam steam-games.json --ratings data/ratings.json
            python src/merge-games.py -s steam.json -r ratings.json -o output.json
        This performs an inner join between Steam data and manual data.
        Only games that exist in BOTH files will be included in the output.
        Game names must match exactly (case-sensitive).
        """
    parser = argparse.ArgumentParser(
        description="Merge Steam-scraped game data with manual data (including ratings)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=epilog_text
    )
    parser.add_argument(
        '-s', '--steam',
        default='data/steam-games.json',
        help='Path to Steam games JSON file (default: data/steam-games.json)'
    )
    parser.add_argument(
        '-r', '--ratings',
        default='data/ratings.json',
        help='Path to manual ratings JSON file (default: data/ratings.json)'
    )
    parser.add_argument(
        '-o', '--output',
        default='data/merged-games.json',
        help='Path for merged output JSON file (default: data/merged-games.json)'
    )
    return parser.parse_args()

def parse_ratings_file(ratings_file: str) -> dict[str, dict[str, object]]:
    """
    Parses the ratings file JSON and returns a dictionary of game dictionaries.
    Args:
        ratings_file: Path to manual ratings JSON file
    Returns:
        Dictionary of game dictionaries, keyed by game name.
    """
    logger.info(f"Parsing ratings file: {ratings_file}")
    # Read raw JSON into list
    with open(ratings_file, 'r', encoding='utf-8') as f:
        ratings_raw = json.load(f)
    # Convert to dictionary of game dictionaries, excluding games with null ratings
    ratings_filtered = [game for game in ratings_raw if game['rating'] is not None]
    ratings_dict = {game['game']: game for game in ratings_filtered}
    # Drop "game" key from each game dictionary (now keyed by game name)
    for game in ratings_dict.values():
        del game['game']
    logger.info(f"Parsed {len(ratings_dict)} games from ratings file")
    return ratings_dict

def parse_steam_file(steam_file: str) -> dict[str, dict[str, object]]:
    """
    Parses the Steam games file JSON and returns a dictionary of game dictionaries.
    Args:
        steam_file: Path to Steam games JSON file
    Returns:
        Dictionary of game dictionaries, keyed by game name.
    """
    logger.info(f"Parsing Steam games file: {steam_file}")
    # Read raw JSON into list
    with open(steam_file, 'r', encoding='utf-8') as f:
        steam_raw = json.load(f)
    # Convert to dictionary of game dictionaries
    steam_dict = {game['game']: game for game in steam_raw}
    # Drop "game" key from each game dictionary (now keyed by game name)
    for game in steam_dict.values():
        del game['game']
    logger.info(f"Parsed {len(steam_dict)} games from Steam games file")
    return steam_dict

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

def inner_join_dicts(dict1: dict, dict2: dict) -> dict:
    """
    Performs an inner join between two dictionaries.
    Args:
        dict1: First dictionary
        dict2: Second dictionary
    Returns:
        dict: Dictionary whose keys are the intersection of dict1 and dict2,
            and whose values combine the values of dict1 and dict2 for each key.
            If the same key is present in both dictionaries, the value from dict2
            is used.
    """
    logger.debug(f"Inner-joining dictionaries")
    logger.debug(f"# keys in dict1: {len(dict1)}")
    logger.debug(f"# keys in dict2: {len(dict2)}")
    # Find intersection of keys
    intersection = set(dict1.keys()) & set(dict2.keys())
    logger.debug(f"# keys in intersection: {len(intersection)}")
    # Generate new dictionary
    combined = {}
    for key in intersection:
        # Extract subdicts
        d1 = dict1[key]
        d2 = dict2[key]
        # Combine the two subdicts
        combined[key] = d1 | d2 # Values from dict2 override values from dict1
    logger.debug(f"# keys in combined dict: {len(combined)}")
    return combined

def merge_steam_ratings(
        steam_file: str,
        ratings_file: str,
) -> dict[str, dict[str, object]]:
    """
    Reads Steam and manual game data from corresponding JSON files,
    merges them using an inner join, and returns the merged data.
    Args:
        steam_file: Path to Steam games JSON file
        ratings_file: Path to manual ratings JSON file
    Returns:
        Dictionary of merged game dictionaries, keyed by game name.
    """
    # Parse the files
    steam_dict = parse_steam_file(steam_file)
    ratings_dict = parse_ratings_file(ratings_file)
    # Merge the dictionaries
    logger.info(f"Merging Steam and ratings data")
    merged_dict = inner_join_dicts(steam_dict, ratings_dict)
    logger.info(f"Found {len(merged_dict)} games in both files")
    return merged_dict

def merge_games_data(
        input_files: dict[str, str],
        output_file: str,
) -> None:
    """
    Merges game data from multiple input files and writes the result to an output file.
    Args:
        input_files: Dictionary of input file paths, keyed by file type.
        output_file: Path for merged output file
    """
    # Merge Steam and ratings data
    merged_dict = merge_steam_ratings(
        steam_file=input_files['steam'],
        ratings_file=input_files['ratings'],
    )
    # Write output dict to JSON
    write_merged_games(merged_games=merged_dict, output_file=output_file)

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
    # Merge games data
    logger.info("Merging games data.")
    input_files = {
        'steam': args.steam,
        'ratings': args.ratings,
    }
    merge_games_data(
        input_files=input_files,
        output_file=args.output,
    )
    logger.info("Script completed successfully.")
    end_time = time.time()
    logger.info(f"Total time elapsed: {end_time - start_time} seconds")

if __name__ == "__main__":
    main() 