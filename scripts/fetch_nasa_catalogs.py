from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urlencode

import requests


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "data" / "nasa_catalogs"
TAP_SYNC = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"

CATALOG_QUERIES = {
    "confirmed_planets_ps.csv": """
        select pl_name,hostname,ra,dec,discoverymethod,disc_year,disc_facility,
               pl_orbper,pl_orbsmax,pl_orbeccen,pl_rade,pl_bmasse,sy_dist,
               st_teff,st_rad,st_mass,st_lum,st_spectype
        from ps
        where default_flag = 1
    """,
    "tess_project_candidates_toi.csv": """
        select toi,tid,tfopwg_disp,ra,dec,pl_orbper,pl_trandep,pl_trandurh,
               pl_rade,st_tmag,st_teff,st_rad,st_logg
        from toi
    """,
    "kepler_koi_cumulative.csv": """
        select kepid,kepoi_name,kepler_name,koi_disposition,koi_pdisposition,
               koi_score,koi_period,koi_duration,koi_depth,koi_prad,koi_sma,
               koi_teq,koi_steff,koi_srad,koi_smass,ra,dec
        from cumulative
    """,
}


def tap_url(query: str, output_format: str = "csv") -> str:
    compact = " ".join(query.split())
    return f"{TAP_SYNC}?{urlencode({'query': compact, 'format': output_format})}"


def fetch_catalog(filename: str, query: str, timeout: int) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    url = tap_url(query)
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    destination = OUTPUT_DIR / filename
    destination.write_bytes(response.content)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch official NASA Exoplanet Archive catalog snapshots.")
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--only", choices=sorted(CATALOG_QUERIES), default=None)
    args = parser.parse_args()

    selected = {args.only: CATALOG_QUERIES[args.only]} if args.only else CATALOG_QUERIES
    for filename, query in selected.items():
        try:
            path = fetch_catalog(filename, query, timeout=args.timeout)
            size_mb = path.stat().st_size / 1024 / 1024
            print(f"{filename}: saved {size_mb:.2f} MB to {path}")
        except Exception as exc:
            print(f"{filename}: failed: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
