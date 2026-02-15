#!/usr/bin/env python3
"""
CLI entry point for the Nekazari sensor sender.
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Optional

from sender.config import load_config, SenderConfig
from sender.runner import SenderRunner
from sender.payloads import build_payload_from_dict


logger = logging.getLogger(__name__)


def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Nekazari sensor sender")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config.yaml"),
        help="Path to configuration file",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Enable debug logging"
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    send_parser = subparsers.add_parser(
        "send", help="Send a single payload (JSON file or inline)"
    )
    send_parser.add_argument(
        "--input",
        type=Path,
        help="Path to JSON file with measurements",
    )
    send_parser.add_argument(
        "--data",
        type=str,
        help="Raw JSON string with measurements",
    )

    subparsers.add_parser(
        "daemon", help="Run continuous sender (watches configured inputs)"
    )

    subparsers.add_parser(
        "drain-queue",
        help="Flush pending messages stored in the local queue",
    )

    return parser.parse_args()


def load_inline_payload(data: Optional[str], file_path: Optional[Path]) -> dict:
    if data:
        return json.loads(data)
    if file_path:
        content = file_path.read_text(encoding="utf-8")
        return json.loads(content)
    raise ValueError("Provide --data or --input with JSON payload")


def cmd_send(config: SenderConfig, args: argparse.Namespace) -> None:
    runner = SenderRunner(config)
    raw_payload = load_inline_payload(args.data, args.input)
    payload = build_payload_from_dict(config, raw_payload)
    runner.send_once(payload)


def cmd_daemon(config: SenderConfig) -> None:
    runner = SenderRunner(config)
    runner.run_daemon()


def cmd_drain_queue(config: SenderConfig) -> None:
    runner = SenderRunner(config)
    runner.drain_queue()


def main() -> None:
    args = parse_args()
    setup_logging(args.verbose)

    config = load_config(args.config)

    if args.command == "send":
        cmd_send(config, args)
    elif args.command == "daemon":
        cmd_daemon(config)
    elif args.command == "drain-queue":
        cmd_drain_queue(config)
    else:
        raise SystemExit(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    main()

