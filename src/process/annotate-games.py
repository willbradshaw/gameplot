#!/usr/bin/env python3
"""
Annotate platform-specific game data with manual information (including ratings)
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

# Import shared functionality from aux.py
from aux import setup_logging, parse_game_json, write_game_json, get_most_recent_date

#==============================================================================
# Configure logging
#==============================================================================

logger = setup_logging(level=logging.DEBUG)

#==============================================================================
# I/O Functions
#==============================================================================

def parse_args() -> argparse.Namespace:
    """Parse command line arguments"""
    epilog_text = """
        Example:
            python src/merge-games.py -p data/merged-platforms.json -a data/annotations.json -o data/merged-games.json
        This performs an inner join between platform-specific data and manual annotations.
        Only games that exist in BOTH files will be included in the output.
        Game names must match exactly (case-sensitive).
        """
    parser = argparse.ArgumentParser(
        description="Annotate platform-specific game data with manual information (including ratings)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=epilog_text
    )
    parser.add_argument(
        '-p', '--platform-data',
        default='data/merged-platforms.json',
        help='Path to platform-specific games JSON file (default: data/merged-platforms.json)'
    )
    parser.add_argument(
        '-a', '--annotations',
        default='data/annotations.json',
        help='Path to manual annotations JSON file (default: data/annotations.json)'
    )
    parser.add_argument(
        '-o', '--output',
        default='data/annotated-games.json',
        help='Path for merged output JSON file (default: data/annotated-games.json)'
    )
    parser.add_argument(
        '-b', '--blank-annotations',
        default='data/blank-annotations.json',
        help='Path for blank annotations JSON file for games currently missing annotations'
    )
    return parser.parse_args()

def parse_platform_data(platform_data: str) -> dict[str, dict[str, object]]:
    """
    Parses the platform data file JSON and returns a dictionary of game dictionaries.
    Args:
        platform_data: Path to platform-specific games JSON file
    Returns:
        Dictionary of game dictionaries, keyed by game name.
    """
    logger.info(f"Parsing platform data file: {platform_data}")
    game_dict = parse_game_json(platform_data)
    logger.info(f"Parsed {len(game_dict)} games from {platform_data}")
    return game_dict

def parse_annotations_file(annotations_file: str) -> dict[str, dict[str, object]]:
    """
    Parses the annotations file JSON and returns a dictionary of game dictionaries.
    Args:
        annotations_file: Path to manual annotations JSON file
    Returns:
        Dictionary of game dictionaries, keyed by game name.
    """
    logger.info(f"Parsing annotations file: {annotations_file}")
    game_dict = parse_game_json(annotations_file)
    logger.info(f"Parsed {len(game_dict)} games from {annotations_file}")
    return game_dict

def expand_aliases(annotations: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    """
    Expands the annotations dictionary to include entries for all aliases.
    Each alias gets its own entry pointing to the same game data (with a marker).
    
    Args:
        annotations: Dictionary of annotations, keyed by game name.
    Returns:
        Dictionary of annotations with alias entries added.
    """
    expanded = annotations.copy()
    alias_count = 0
    for game_name, game_data in annotations.items():
        if 'aliases' in game_data and game_data['aliases']:
            for alias in game_data['aliases']:
                if alias in expanded:
                    logger.warning(f"Alias '{alias}' for '{game_name}' conflicts with existing game")
                    continue
                # Create an entry for the alias that points back to the main game
                # Mark it as an alias so we know not to double-count it
                alias_entry = game_data.copy()
                alias_entry['_isAliasOf'] = game_name
                expanded[alias] = alias_entry
                alias_count += 1
    if alias_count > 0:
        logger.info(f"Expanded {alias_count} aliases from annotations")
    return expanded

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

def merge_annotations(
        platform_data: dict[str, dict[str, object]],
        annotations: dict[str, dict[str, object]],
) -> dict[str, dict[str, object]]:
    """
    Merges platform-specific game data with manual annotations.
    Args:
        platform_data: Dictionary of platform-specific game data, keyed by game name.
        annotations: Dictionary of manual annotations, keyed by game name.
    Returns:
        Dictionary of merged game dictionaries, keyed by game name.
    """
    # First filter annotations to exclude games with null ratings
    logger.info(f"Filtering annotations to exclude games with null ratings")
    annotations_filtered = annotations.copy()
    games_to_delete = []
    for game in annotations_filtered:
        if annotations_filtered[game]['rating'] is None:
            games_to_delete.append(game)
    for game in games_to_delete:
        del annotations_filtered[game]
    logger.info(f"{len(annotations_filtered)} games remaining after filtering")
    
    # Expand aliases so that platform names matching aliases will be included
    annotations_expanded = expand_aliases(annotations_filtered)
    logger.info(f"{len(annotations_expanded)} annotation entries after alias expansion")
    
    # Merge the dictionaries
    logger.info(f"Merging platform data and annotations")
    merged_dict = inner_join_dicts(platform_data, annotations_expanded)
    
    # Remove the _isAliasOf marker before further processing
    for game_data in merged_dict.values():
        if '_isAliasOf' in game_data:
            del game_data['_isAliasOf']
        # Also remove the aliases field as it's no longer needed after merging
        if 'aliases' in game_data:
            del game_data['aliases']
    
    # Collapse games with the same displayName
    collapsed_dict = collapse_by_display_name(merged_dict)
    # Determine display URL
    display_dict = get_display_url(collapsed_dict)
    # Order platforms by playtime
    sorted_dict = order_platforms(display_dict)
    return sorted_dict

def order_platforms(collapsed_games: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    """
    Order by-platform data in descending order of playtime.
    Args:
        collapsed_games: Dictionary of collapsed game dictionaries, keyed by display name.
    Returns:
        Sorted dictionary of collapsed game dictionaries, keyed by display name, with by-platform
        data ordered in descending order of playtime.
    """
    keys_to_sort = ["platforms", "ids", "urls", "lastPlayedSingle", "hoursPlayedSingle"]
    sorted_games = {}
    for game in collapsed_games:
        # Get sorting function
        sorted_entry = collapsed_games[game].copy()
        def sort_by_playtime(list_to_sort: list) -> list:
            key_dict = dict(zip(list_to_sort, sorted_entry['hoursPlayedSingle']))
            return sorted(list_to_sort, key=key_dict.get, reverse = True)
        for key in keys_to_sort:
            sorted_entry[key] = sort_by_playtime(sorted_entry[key])
        sorted_games[game] = sorted_entry
    return sorted_games

def get_display_url(collapsed_games: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    """
    Determine the display URL for each game and add it to the game data.
    Args:
        collapsed_games: Dictionary of collapsed game dictionaries, keyed by display name.
    Returns:
        Dictionary of collapsed game dictionaries, keyed by display name, with additional
        'displayUrl' key.
    """
    URL_PREFERENCE = ["Steam", "PS5"]
    # Go down the preference list and find the first URL that is not None
    # If there is no such URL, use the first URL in the URL list
    for game in collapsed_games:
        for platform in URL_PREFERENCE:
            if platform in collapsed_games[game]['platforms']:
                idx = collapsed_games[game]['platforms'].index(platform)
                collapsed_games[game]['displayUrl'] = collapsed_games[game]['urls'][idx]
                break
        else:
            collapsed_games[game]['displayUrl'] = collapsed_games[game]['urls'][0]
    return collapsed_games

def collapse_by_display_name(merged_games: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    """
    Collapses games with the same displayName, using displayName as the new key.
    Falls back to original game name when displayName is not present.
    Args:
        merged_games: Dictionary of merged game dictionaries, keyed by original game name.
    Returns:
        Dictionary of collapsed game dictionaries, keyed by display name or game name.
    """
    collapsed_games = {}
    for original_game_name, game_data in merged_games.items():
        # Determine the key to use (displayName if present, otherwise original game name)
        display_name = game_data.get('displayName', original_game_name)
        # Create a copy of the game data without the displayName key (we'll use it as the key)
        collapsed_data = game_data.copy()
        if 'displayName' in collapsed_data:
            del collapsed_data['displayName']
        # If this is the first time we see this display name, add it directly
        if display_name not in collapsed_games:
            collapsed_games[display_name] = collapsed_data
            continue
        # Otherwise, we have a collision - need to merge and check for incompatibilities
        existing_data = collapsed_games[display_name]
        logger.info(f"Merging duplicate entries for game: {display_name}")
        # rating and status should be identical
        assert collapsed_data['rating'] == existing_data['rating'], \
            f"Incompatible ratings for game '{display_name}': {collapsed_data['rating']} vs {existing_data['rating']}"
        assert collapsed_data['status'] == existing_data['status'], \
            f"Incompatible statuses for game '{display_name}': {collapsed_data['status']} vs {existing_data['status']}"
        # ids, urls, hoursPlayedSingle, lastPlayedSingle all handled on a per-platform basis
        for platform in collapsed_data['platforms']:
            platform_idx = collapsed_data['platforms'].index(platform)
            hoursPlayedSingle = collapsed_data['hoursPlayedSingle'][platform_idx]
            lastPlayedSingle = collapsed_data['lastPlayedSingle'][platform_idx]
            id = collapsed_data['ids'][platform_idx]
            url = collapsed_data['urls'][platform_idx]
            if platform not in existing_data['platforms']:
                existing_data['platforms'].append(platform)
                existing_data['hoursPlayedSingle'].append(hoursPlayedSingle)
                existing_data['lastPlayedSingle'].append(lastPlayedSingle)
                existing_data['ids'].append(id)
                existing_data['urls'].append(url)
            else:
                platform_idx_existing = existing_data['platforms'].index(platform)
                latest_date = get_most_recent_date(
                    lastPlayedSingle,
                    existing_data['lastPlayedSingle'][platform_idx_existing],
                )
                overwrite_mismatches = latest_date == lastPlayedSingle
                existing_data['hoursPlayedSingle'][platform_idx_existing] += hoursPlayedSingle
                existing_data['lastPlayedSingle'][platform_idx_existing] = latest_date
                if overwrite_mismatches:
                    existing_data['ids'][platform_idx_existing] = id
                    existing_data['urls'][platform_idx_existing] = url
        # lastPlayedTotal and hoursPlayedTotal handled on a per-game basis
        existing_data['lastPlayedTotal'] = get_most_recent_date(
            collapsed_data['lastPlayedTotal'],
            existing_data['lastPlayedTotal'],
        )
        existing_data['hoursPlayedTotal'] += collapsed_data['hoursPlayedTotal']
        # tags should be merged
        existing_data['tags'] = sorted(set(existing_data['tags'] + collapsed_data['tags']))
        # Finally, add updated game data to the collapsed dictionary
        collapsed_games[display_name] = existing_data
    logger.info(f"Collapsed to {len(collapsed_games)} unique games")
    return collapsed_games

#==============================================================================
# Miscellaneous functions
#==============================================================================

def report_missing_games(annotations: dict[str, dict[str, object]],
                        platform_data: dict[str, dict[str, object]],
                        blank_annotations: dict[str, dict[str, object]]) -> None:
    """
    Reports games that are present in the platform data but not in the annotations file,
    and vice versa. Uses expanded aliases when comparing.
    Args:
        annotations: Dictionary of annotations, keyed by game name.
        platform_data: Dictionary of platform data, keyed by game name.
    """
    # Expand aliases for comparison purposes
    annotations_expanded = expand_aliases(annotations)
    
    # Get base annotation names (excluding aliases) for reporting
    # We only want to report on base games, not their aliases
    base_annotation_names = set(
        name for name, data in annotations.items()
        if '_isAliasOf' not in data
    )
    
    # Get all annotation keys including aliases for matching
    all_annotation_keys = set(annotations_expanded.keys())
    games_platform = set(platform_data.keys())
    
    # Games in platform data but not matching any annotation (including aliases)
    missing_platform = games_platform - all_annotation_keys
    
    # Games in annotations (base names only) but not in platform data
    # For each base annotation, check if it OR any of its aliases exist in platform data
    missing_annotation = set()
    for game_name, game_data in annotations.items():
        if '_isAliasOf' in game_data:
            continue  # Skip alias entries
        # Check if the game itself is in platform data
        if game_name in games_platform:
            continue
        # Check if any of its aliases are in platform data
        aliases = game_data.get('aliases', [])
        if any(alias in games_platform for alias in aliases):
            continue
        # Neither the game nor any alias found
        missing_annotation.add(game_name)
    
    if missing_annotation:
        logger.info(
            f'{len(missing_annotation)} games present in annotations but not in platform data:'
            f'{missing_annotation}'
        )
    if missing_platform:
        logger.info(
            f'{len(missing_platform)} games present in platform data but not in annotations:'
            f'{missing_platform}'
        )
        blank_dict = build_blank_annotations(missing_platform)
        write_game_json(blank_dict, blank_annotations)

def build_blank_annotations(games: list[str]) -> dict[str, dict[str, object]]:
    """
    Builds a blank annotations dictionary for a list of games.
    Args:
        games: List of game names
    Returns:
        Dictionary of blank annotations, keyed by game name.
    """
    blank_annotations = {}
    for game in games:
        blank_annotations[game] = {
            'rating': None,
            'status': None,
            'tags': [],
        }
    return blank_annotations

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
    # Parse input files
    logger.info("Parsing input files.")
    platform_data = parse_platform_data(args.platform_data)
    annotations = parse_annotations_file(args.annotations)
    # Check for missing games in annotations file
    report_missing_games(platform_data, annotations, args.blank_annotations)
    # Merge games data
    logger.info("Merging games data.")
    output_data = merge_annotations(
        platform_data=platform_data,
        annotations=annotations,
    )
    # Write output
    logger.info("Writing output file.")
    write_game_json(output_data, args.output)
    # Cleanup
    logger.info("Script completed successfully.")
    end_time = time.time()
    logger.info(f"Total time elapsed: {end_time - start_time} seconds")

if __name__ == "__main__":
    main() 