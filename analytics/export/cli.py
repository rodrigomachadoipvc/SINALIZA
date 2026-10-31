"""`uv run sinaliza-export`: operational tables → Parquet → the Bronze landing volume."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import psycopg

from common.config import OUTPUT_DIR, ConfigError, databricks_settings, load_env
from common.lake import batch_stamp, files_api, upload, write_table
from export.extract import SOURCES, State, extract


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="sinaliza-export",
        description="Exporta as bases operacionais para Parquet e envia-as para o volume.",
    )
    parser.add_argument("--out", type=Path, default=OUTPUT_DIR / "export")
    parser.add_argument("--full", action="store_true", help="ignora as marcas e exporta tudo")
    parser.add_argument(
        "--no-upload", action="store_true", help="só escreve os Parquet (sem Databricks)"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    try:
        run(parse_args(argv))
    except (ConfigError, psycopg.OperationalError) as error:
        sys.exit(f"Erro: {error}")


def run(args: argparse.Namespace) -> None:
    env = load_env()
    # Check the Databricks settings before reading anything, so a missing token fails fast.
    settings = None if args.no_upload else databricks_settings(env)
    state = State(args.out / "state.json")
    stamp = batch_stamp()

    files: list[Path] = []
    for source in SOURCES:
        since = None if args.full else state.since(source.table)
        frame = extract(source, env, since)
        label = f"desde {since.isoformat()}" if since else "completo"
        print(f"{source.table}: {len(frame)} linhas ({label})")
        if frame.empty:
            continue
        files.append(write_table(frame, source.table, args.out, stamp))
        state.advance(source.table, frame, source.watermark)

    if settings and files:
        for target in upload(files, args.out, files_api(settings)):
            print(f"  → {target}")
    # Only move the watermarks once the files are safely in the volume (or written, offline).
    state.save()


if __name__ == "__main__":
    main()
