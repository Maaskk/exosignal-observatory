from __future__ import annotations

import argparse
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BASE_URL = "https://huggingface.co/datasets/bingbangboom/exoplanet-transit-detection/resolve/main"

FILES = {
    "metadata": "metadata.csv",
    "train": "train.parquet",
    "val": "val.parquet",
    "test": "test.parquet",
}


def _expected_size(response: requests.Response, already_have: int) -> int:
    content_range = response.headers.get("content-range")
    if content_range and "/" in content_range:
        try:
            return int(content_range.rsplit("/", 1)[1])
        except ValueError:
            pass
    content_length = int(response.headers.get("content-length", 0) or 0)
    return already_have + content_length if response.status_code == 206 else content_length


def download_file(name: str, retries: int = 8) -> None:
    if name not in FILES:
        raise ValueError(f"Unknown split {name!r}. Choose from {', '.join(FILES)}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    filename = FILES[name]
    output = DATA_DIR / filename
    if output.exists() and output.stat().st_size > 0:
        print(f"ok: {filename} already exists ({output.stat().st_size / 1024 / 1024:.1f} MB)")
        return

    url = f"{BASE_URL}/{filename}"
    print(f"downloading: {url}")
    tmp = output.with_suffix(output.suffix + ".part")
    attempt = 0
    while attempt < retries:
        attempt += 1
        already_have = tmp.stat().st_size if tmp.exists() else 0
        headers = {"Range": f"bytes={already_have}-"} if already_have else {}
        mode = "ab" if already_have else "wb"
        try:
            with requests.get(url, stream=True, timeout=(30, 300), headers=headers) as response:
                if already_have and response.status_code == 200:
                    print(f"\nserver ignored resume for {filename}; restarting from byte 0")
                    already_have = 0
                    mode = "wb"
                response.raise_for_status()
                total = _expected_size(response, already_have)
                done = already_have
                with tmp.open(mode) as handle:
                    for chunk in response.iter_content(chunk_size=4 * 1024 * 1024):
                        if not chunk:
                            continue
                        handle.write(chunk)
                        done += len(chunk)
                        if total:
                            pct = done / total * 100
                            print(
                                f"\r{filename}: {done / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MB ({pct:.1f}%)",
                                end="",
                                flush=True,
                            )
                        else:
                            print(f"\r{filename}: {done / 1024 / 1024:.1f} MB", end="", flush=True)
            print()
            if total and tmp.stat().st_size < total:
                raise RuntimeError(f"incomplete download: {tmp.stat().st_size} < {total}")
            tmp.replace(output)
            print(f"saved: {output}")
            return
        except Exception as exc:
            print(f"\nretry {attempt}/{retries} for {filename}: {exc}")
            time.sleep(min(10, attempt * 2))
    raise RuntimeError(f"failed to download {filename} after {retries} attempts")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download real Kepler/K2/TESS transit dataset splits from Hugging Face.")
    parser.add_argument("--splits", nargs="+", default=["metadata", "test", "val"], choices=list(FILES.keys()))
    args = parser.parse_args(argv)
    for split in args.splits:
        download_file(split)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
