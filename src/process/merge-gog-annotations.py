#!/usr/bin/env python3
"""
Merge GOG games data with manual annotations (playtime and last-played data).
"""

import argparse
import time
from aux import setup_logging, parse_game_json, write_game_json

def parse_args() -> argparse.Namespace:
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description="Merge GOG games data with manual annotations"
    )
    parser.add_argument(
        '-g', '--gog-games',
        default='data/gog-games.json',
        help='Path to GOG games JSON file (default: data/gog-games.json)'
    )
    parser.add_argument(
        '-a', '--annotations',
        default='data/gog-annotations.json',
        help='Path to GOG annotations file (default: data/gog-annotations.json)'
    )
    parser.add_argument(
        '-o', '--output',
        default='data/gog-games-annotated.json',
        help='Path for output file (default: data/gog-games-annotated.json)'
    )
    return parser.parse_args()

def merge_gog_annotations(gog_games: dict[str, dict], annotations: dict[str, dict]) -> dict[str, dict]:
    """
    Merge GOG games data with manual annotations.
    Only includes games that exist in the annotations file.
    
    Args:
        gog_games: Dictionary of GOG games data, keyed by game name
        annotations: Dictionary of manual annotations, keyed by game name
        
    Returns:
        Dictionary of merged game data, keyed by game name (only annotated games)
    """
    logger = setup_logging()
    merged_games = {}
    
    # Only process games that have annotations
    for game_name in annotations.keys():
        if game_name in gog_games:
            # Merge GOG data with annotations
            merged_entry = gog_games[game_name].copy()
            annotation = annotations[game_name]
            merged_entry['lastPlayed'] = annotation['lastPlayed']
            merged_entry['hoursPlayed'] = annotation['hoursPlayed']
            merged_games[game_name] = merged_entry
            logger.debug(f"Merged {game_name}")
        else:
            logger.warning(f"Game '{game_name}' has annotations but not found in GOG games")
    
    logger.info(f"Merged {len(merged_games)} games (only games with annotations)")
    
    return merged_games

def main():
    """Main entry point"""
    logger = setup_logging()
    logger.info("Starting GOG annotation merge")
    start_time = time.time()
    
    # Parse arguments
    args = parse_args()
    logger.info(f"GOG games file: {args.gog_games}")
    logger.info(f"Annotations file: {args.annotations}")
    logger.info(f"Output file: {args.output}")
    
    # Parse input files
    logger.info("Loading GOG games data")
    gog_games = parse_game_json(args.gog_games)
    logger.info(f"Loaded {len(gog_games)} GOG games")
    
    logger.info("Loading annotations data")
    annotations = parse_game_json(args.annotations)
    logger.info(f"Loaded {len(annotations)} annotations")
    
    # Merge data
    logger.info("Merging data")
    merged_games = merge_gog_annotations(gog_games, annotations)
    
    # Write output
    logger.info("Writing output file")
    write_game_json(merged_games, args.output)
    logger.info(f"Output written to {args.output}")
    
    end_time = time.time()
    logger.info(f"Completed in {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    main() 