#!/usr/bin/env python3

DESC = """
Scrape Xbox Live gaming data using OpenXBL API and extract JSON data.
Requires an OpenXBL API key from https://xbl.io
"""

#==============================================================================
# Imports
#==============================================================================

import requests
import json
import time
import sys
import logging
import argparse
from datetime import datetime, timezone
from typing import Literal

#==============================================================================
# Logging
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
# Constants
#==============================================================================

# OpenXBL API configuration
OPENXBL_BASE_URL = 'https://xbl.io/api/v2'

# Description epilog
DESC_EPILOG = """
Examples:
  python src/xbox-scraper.py YOUR_API_KEY
  python src/xbox-scraper.py YOUR_API_KEY --output my-xbox-games.json

To get your OpenXBL API key:
  1. Visit https://xbl.io/
  2. Sign in with your Xbox Live account  
  3. Generate a personal API key from your profile
"""

#==============================================================================
# API functions
#==============================================================================

def make_openxbl_request(api_key: str,
                         endpoint: str,
                         method: Literal['GET', 'POST'] = 'GET',
                         data: dict|None = None) -> dict:
    """
    Make an authenticated API call to OpenXBL
    Args:
        api_key [str]: OpenXBL API key
        endpoint [str]: API endpoint (e.g., '/account', '/search/gamertag')
        method [str]: HTTP method (GET or POST)
        data [dict|None]: Data to send in POST request
    Returns:
        dict: Parsed JSON response
    """
    # Set up URL
    endpoint = endpoint if endpoint.startswith('/') else '/' + endpoint
    url = OPENXBL_BASE_URL + endpoint
    # Set up headers
    headers = {
        'X-Authorization': api_key,
        'Accept': 'application/json',
        'User-Agent': 'GamePlot Xbox Scraper (Python)'
    }
    if method == 'POST' and data:
        headers['Content-Type'] = 'application/json'
    # Make request
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data)
        else:
            raise ValueError(f"Unsupported method: {method}")
        if response.status_code != 200:
            msg = (
                f"❌ OpenXBL API Error: {response.status_code} ({response.reason})."
                f"Response: {response.text}"
            )
            logger.error(msg)
            raise ValueError(msg)
        return response.json()
    except requests.RequestException as e:
        msg = f"❌ Request failed: {e}"
        logger.error(msg)
        raise e
    except json.JSONDecodeError as e:
        msg = f"❌ JSON parse error: {e}"
        logger.error(msg)
        raise e

def get_account_info(api_key: str) -> dict:
    """
    Get account information for the authenticated user
    Args:
        api_key [str]: OpenXBL API key
    Returns:
        dict: Account information
    """
    return make_openxbl_request(api_key, '/account')

def get_title_history(api_key: str, xuid: str) -> list[dict]:
    """
    Get title history (gaming history) for a user
    Args:
        api_key [str]: OpenXBL API key
        xuid [str]: Xbox User ID
    Returns:
        list[dict]: Title history
    """
    result = make_openxbl_request(api_key, f'/player/titleHistory/{xuid}')
    if result and 'titles' in result:
        return result['titles']
    else:
        return []

def get_playtime_stats(api_key: str, xuid: str, games: list[dict]) -> dict[str, float]:
    """
    Get playtime statistics for games using the stats API.
    Batches multiple games into a single request for efficiency.
    Args:
        api_key [str]: OpenXBL API key
        xuid [str]: Xbox User ID
        games [list[dict]]: Array of game objects with titleId
    Returns:
        dict[str, float]: Dictionary mapping titleId to hours played
    """
    logger.info(f"Fetching playtime stats for {len(games)} games.")
    # Create a single request for all games
    # Test: Remove the "groups" part to see if it's necessary
    stats_request = {
        'xuids': [xuid],
        'stats': [
            {
                'name': 'MinutesPlayed',
                'titleId': game['titleId']
            }
            for game in games
        ]
    }
    # Make request
    stats_result = make_openxbl_request(api_key, '/player/stats', 'POST', stats_request)
    # Parse response
    playtime_map = {}
    if stats_result and 'statlistscollection' in stats_result and len(stats_result['statlistscollection']) > 0:
        stats = stats_result['statlistscollection'][0]['stats']
        stats_filtered = [stat for stat in stats if stat['name'] == 'MinutesPlayed']
        ids_in = set(game['titleId'] for game in games)
        ids_out = set(stat['titleid'] for stat in stats_filtered)
        logger.info(f"Found playtime stats for {len(stats_filtered)} games.")
        assert ids_in >= ids_out, f"IDs in ({ids_in}) must be a superset of IDs out ({ids_out})"
        if ids_in > ids_out:
            ids_lost = ids_in - ids_out
            games_lost = [game['name'] for game in games if game['titleId'] in ids_lost]
            logger.warning(f"Failed to find playtime stats for {len(ids_lost)} games.")
            logger.warning(f"Games lost: {games_lost}")
        logger.info(f"Parsing playtime stats for remaining {len(ids_out)} games.")
        for stat in stats:
            assert stat.get("titleid"), f"No titleid in stat: {stat}"
            title_id = stat['titleid']
            name = next((game['name'] for game in games if game['titleId'] == title_id), None)
            if stat.get("value"):
                hours_played = convert_playtime(stat['value'])
                playtime_map[title_id] = hours_played
                logger.info(f"\t✅ {name} ({title_id}): {hours_played} hours")
            else:
                logger.warning(f"\t❌ {name} ({title_id}): no playtime value in data; setting to 0")
                playtime_map[title_id] = 0
    else:
        msg = "❌ No stats data available in response"
        logger.error(msg)
        raise ValueError(msg)
    logger.info(f"Successfully fetched playtime stats for {len(playtime_map)} games")
    # Return playtime map
    return playtime_map

def convert_playtime(minutes_played: str) -> float:
    """
    Convert minutes played to hours played.
    Args:
        minutes_played [str]: Minutes played in string format
    Returns:
        float: Hours played
    """
    try:
        minutes = int(minutes_played)
    except ValueError as e:
        msg = f"Invalid minutes value: {minutes_played}"
        logger.error(msg)
        raise ValueError(msg)
    return round((minutes / 60) * 10) / 10

#==============================================================================
# Parsing functions
#==============================================================================

def filter_played_games(xbox_games: list[dict]) -> list[dict]:
    """
    Filter a list of Xbox games to only include those that have been played.
    Args:
        xbox_games [list[dict]]: List of Xbox games
    Returns:
        list[dict]: List of filtered Xbox games
    """
    # Filter games
    keep_games = []
    n_excluded = 0
    for game in xbox_games:
        if not game.get('titleHistory') or \
                not game['titleHistory'].get('lastTimePlayed'):
            logger.debug(f"✗ EXCLUDE: {game['name']}: no lastTimePlayed data")
            n_excluded += 1
            continue
        keep_games.append(game)
        logger.debug(f"✓ INCLUDE: {game['name']}: has lastTimePlayed ({game['titleHistory']['lastTimePlayed']})")
    logger.info(f"Excluded {n_excluded} games, {len(keep_games)} remaining.")
    return keep_games

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

def convert_to_project_format(filtered_games: list[dict], playtime_stats: dict[str, int]) -> list[dict]:
    """
    Converts Xbox Live API data to the project's JSON format (matching Steam/PSN format)
    Args:
        filtered_games [list[dict]]: Array of filtered Xbox games
        playtime_stats [dict[str, int]]: Dictionary of titleId to hours played
    Returns:
        Array of games in project format
    """
    games_map = {}
    for game in filtered_games:
        # Skip if not in playtime_stats
        if game['titleId'] not in playtime_stats:
            continue
        # We already know the game has been played, so we can get the last played date
        last_played_date = datetime.fromisoformat(
            game['titleHistory']['lastTimePlayed'].replace('Z', '+00:00')
        )
        last_played = last_played_date.strftime('%Y-%m-%d')  # Format as YYYY-MM-DD
        # Get playtime data from playtime_stats
        hours_played = playtime_stats.get(game['titleId'], 0)
        if hours_played == 0:
            logger.warning(f"\tWarning: {game['name']}: playtime is 0 hours")
        # Create game data
        game_data = {
            'game': game.get('name', f"Unknown Game ({game['titleId']})"),
            'platform': "Xbox",  # General Xbox platform
            'lastPlayed': last_played,
            'hoursPlayed': hours_played,
            'id': game['titleId'],
            'url': ""
        }
        # Check and handle duplicates
        if game['titleId'] in games_map:
            logger.warning(f"Duplicate game data found for titleId {game['titleId']} ({game['name']})")
            logger.warning(f"Combining duplicate entries.")
            existing_game = games_map[game['titleId']]
            for field in ["game", "platform", "id", "url"]:
                assert existing_game[field] == game_data[field]
            existing_game["lastPlayed"] = get_most_recent_date(existing_game["lastPlayed"], last_played)
            existing_game["hoursPlayed"] += hours_played
        else:
            # Add game to map
            games_map[game['titleId']] = game_data
    # Extract into array and return
    return list(games_map.values())

#==============================================================================
# Scraping functions
#==============================================================================

def scrape_xbox_data(api_key: str, output_file: str) -> None:
    """
    Scrapes Xbox Live gaming data using OpenXBL API and converts it to the project's JSON format
    Args:
        api_key [str]: Your OpenXBL API key
        output_file [str]: Output file path
    """
    # Step 1: Get XUID (Xbox User ID) from authenticated account and parse data
    logger.info("Getting account info for authenticated user.")
    account_info = get_account_info(api_key)
    profile = account_info['profileUsers'][0]
    xuid = profile['id']
    if not xuid:
        msg = "No XUID found in account info"
        logger.error(msg)
        raise ValueError(msg)
    logger.info(f"XUID: {xuid}")
    gamertag = next(
        (setting for setting in profile['settings'] if setting['id'] == 'Gamertag'),
        None
    )['value']
    if not gamertag:
        msg = "No gamertag found in account info"
        logger.error(msg)
        raise ValueError(msg)
    logger.info(f"Gamertag: {gamertag}")
    # Step 2: Get title history (games played)
    logger.info(f"Getting title history for XUID {xuid}.")
    title_history = get_title_history(api_key, xuid)
    if not title_history:
        msg = "Failed to fetch title history or no games found"
        logger.error(msg)
        raise ValueError(msg)
    logger.info(f"Extracted {len(title_history)} games from title history.")
    # Step 3: Filter to only include played games
    logger.info("Excluding unplayed games.")
    filtered_games = filter_played_games(title_history)
    # Step 4: Get playtime statistics for filtered games
    playtime_stats = get_playtime_stats(api_key, xuid, filtered_games)
    # Step 5: Convert to project format
    logger.info("Converting output to project format.")
    converted_games = convert_to_project_format(filtered_games, playtime_stats)
    # Step 6: Save to file
    logger.info("Saving to file.")
    with open(output_file, 'w') as f:
        json.dump(converted_games, f, indent=2)
    logger.info(f"Successfully saved {len(converted_games)} games to {output_file}")

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
        '-k', '--api_key', type=str, required=True,
        help='Your OpenXBL API key from https://xbl.io'
    )
    parser.add_argument(
        '--output', '-o', type=str,
        default='data/xbox-games.json',
        help='Output file path (default: %(default)s)'
    )
    return parser.parse_args()

#==============================================================================
# Main function
#==============================================================================

def main():
    """Command line interface"""
    logger.info("Initializing script for parsing Xbox data.")
    start_time = time.time()
    # Parse arguments
    logger.info("Parsing arguments.")
    args = parse_args()
    logger.info(f"API key: {args.api_key}")
    logger.info(f"Output file: {args.output}")
    # Scrape Xbox data
    scrape_xbox_data(args.api_key, args.output)
    # Wrap up
    logger.info("Script completed successfully.")
    end_time = time.time()
    logger.info(f"Total time elapsed: {end_time - start_time} seconds")

if __name__ == '__main__':
    main() 