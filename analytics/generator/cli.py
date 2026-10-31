"""`uv run sinaliza-generate`: synthetic occurrences for the analytics pipeline."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import psycopg

from common.config import BOUNDARY_FILE, OUTPUT_DIR, ConfigError, databricks_settings, load_env
from common.lake import batch_stamp, files_api, upload, write_table
from generator.geo import Area
from generator.postgres import LoadError, load, purge
from generator.simulate import Options, lake_frames, simulate, summary


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="sinaliza-generate", description="Gera ocorrências sintéticas no concelho de Barcelos."
    )
    parser.add_argument("--count", type=int, default=20_000, help="ocorrências (aprox.)")
    parser.add_argument("--start", type=date.fromisoformat, default=date(2024, 1, 1))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=OUTPUT_DIR / "generated")
    parser.add_argument(
        "--load-postgres", action="store_true", help="insere também na occurrence_db"
    )
    parser.add_argument(
        "--replace", action="store_true", help="apaga antes as ocorrências geradas anteriormente"
    )
    parser.add_argument(
        "--purge", action="store_true", help="só apaga as ocorrências geradas da occurrence_db"
    )
    parser.add_argument("--upload", action="store_true", help="envia os Parquet para o volume")
    args = parser.parse_args(argv)
    if args.count < 1:
        parser.error("--count tem de ser positivo")
    return args


def main(argv: list[str] | None = None) -> None:
    try:
        run(parse_args(argv))
    except (ConfigError, LoadError, ValueError, psycopg.OperationalError) as error:
        sys.exit(f"Erro: {error}")


def run(args: argparse.Namespace) -> None:
    env = load_env()

    if args.purge:
        print(f"Apagadas {purge(env)} ocorrências geradas.")
        return

    dataset = simulate(
        Options(count=args.count, start=args.start, seed=args.seed),
        Area.from_geojson(BOUNDARY_FILE),
    )
    if args.load_postgres:
        dataset = load(dataset, env, replace_existing=args.replace)
        print("Carregado na occurrence_db.")

    stamp = batch_stamp()
    files = [
        write_table(frame, table, args.out, stamp) for table, frame in lake_frames(dataset).items()
    ]
    print(json.dumps(summary(dataset), ensure_ascii=False, indent=2))
    for file in files:
        print(f"  {file}")
    if args.upload:
        for target in upload(files, args.out, files_api(databricks_settings(env))):
            print(f"  → {target}")


if __name__ == "__main__":
    main()
