import argparse
import json
import sys
from typing import Any, Dict, List, Tuple

import httpx


def normalize_db_url(database_url: str) -> str:
    # Accept either full https://...firebaseio.com or without protocol.
    u = database_url.strip().rstrip("/")
    if not u:
        raise ValueError("database_url is empty")
    if not (u.startswith("http://") or u.startswith("https://")):
        u = "https://" + u
    return u


def rtdb_get(db_url: str, path: str, params: Dict[str, str]) -> Dict[str, Any]:
    url = f"{db_url}/{path}.json"
    r = httpx.get(url, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def fetch_jobs_by_status(db_url: str, status: str) -> Dict[str, Dict[str, Any]]:
    # RTDB REST query needs orderBy/equalTo values JSON-encoded (with quotes).
    params = {
        "orderBy": json.dumps("trang_thai", ensure_ascii=False),
        "equalTo": json.dumps(status, ensure_ascii=False),
    }
    return rtdb_get(db_url, "tiktok_videos", params)


def fetch_all_videos(db_url: str) -> Dict[str, Dict[str, Any]]:
    return rtdb_get(db_url, "tiktok_videos", params={})


def simplify_item(video_id: str, item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": video_id,
        "trang_thai": (item.get("trang_thai") or "").strip(),
        "ngay_dang": (item.get("ngay_dang") or "").strip(),
        "local_video_path": (item.get("local_video_path") or "").strip(),
        "tieu_de": (item.get("tieu_de") or "").strip(),
        "cap_nhat_cuoi": item.get("cap_nhat_cuoi") or "",
        "_worker_lock": item.get("_worker_lock") or None,
    }


def sort_like_web(items: List[Dict[str, Any]]) -> None:
    # app.js: sort descending by ngay_dang (string yyyy-mm-dd)
    items.sort(key=lambda x: (x.get("ngay_dang") or ""), reverse=True)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="List tiktok_videos from Firebase RTDB like the web app (REST, no service account)."
    )
    ap.add_argument(
        "--database-url",
        default="https://english-fun-1937c-default-rtdb.firebaseio.com",
        help="RTDB databaseURL (same as in app.js)",
    )
    ap.add_argument(
        "--mode",
        choices=["all", "jobs"],
        default="jobs",
        help="all = fetch everything like web; jobs = only statuses worker picks",
    )
    ap.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    ap.add_argument("--limit", type=int, default=0, help="Limit number of items (0 = no limit)")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    db_url = normalize_db_url(args.database_url)

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    merged: Dict[str, Dict[str, Any]] = fetch_all_videos(db_url)

    out: List[Dict[str, Any]] = [simplify_item(k, v) for k, v in merged.items() if isinstance(v, dict)]
    if args.mode == "jobs":
        out = [x for x in out if x.get("trang_thai") == "Video gốc"]
    sort_like_web(out)

    if args.limit and args.limit > 0:
        out = out[: args.limit]

    payload = json.dumps(out, ensure_ascii=False, indent=2) if args.pretty else json.dumps(out, ensure_ascii=False)
    try:
        print(payload)
    except UnicodeEncodeError:
        # Last-resort: emit escaped output so it can still be copied.
        print(payload.encode("utf-8", errors="replace").decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

