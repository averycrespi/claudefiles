#!/usr/bin/env python3
"""Fetch a single Datadog log event by ID.

Usage:
    python get_log.py --id <log_id>
"""

import argparse
import json
import sys
import urllib.request

from get_credentials import get_credentials

DD_SITE = "datadoghq.com"
LOG_URL = f"https://api.{DD_SITE}/api/v2/logs/events"


def get_log(log_id):
    """Fetch a single log event by ID.

    Returns the log event dict.
    """
    api_key, app_key = get_credentials()
    req = urllib.request.Request(
        f"{LOG_URL}/{log_id}",
        headers={
            "DD-API-KEY": api_key,
            "DD-APPLICATION-KEY": app_key,
        },
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    return result["data"]


def main():
    parser = argparse.ArgumentParser(description="Fetch a Datadog log event by ID")
    parser.add_argument("--id", required=True, dest="log_id", help="Log event ID")
    args = parser.parse_args()

    try:
        log = get_log(args.log_id)
        json.dump(log, sys.stdout, indent=2)
        print()
    except Exception as e:
        json.dump({"error": str(e)}, sys.stderr)
        print(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
