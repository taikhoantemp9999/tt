import argparse
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import firebase_admin
from firebase_admin import credentials, db


def must_getenv(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v


@dataclass
class FirebaseCfg:
    database_url: str
    service_account_json: str


def init_firebase(cfg: FirebaseCfg) -> None:
    if firebase_admin._apps:
        return
    cred = credentials.Certificate(cfg.service_account_json)
    firebase_admin.initialize_app(cred, {"databaseURL": cfg.database_url})


def pick_candidate_jobs() -> Dict[str, Dict[str, Any]]:
    base = db.reference("tiktok_videos")
    jobs: Dict[str, Dict[str, Any]] = {}

    snap1 = base.order_by_child("trang_thai").equal_to("Video gốc").get() or {}
    if isinstance(snap1, dict):
        jobs.update(snap1)

    snap2 = base.order_by_child("trang_thai").equal_to("Đã ghép text").get() or {}
    if isinstance(snap2, dict):
        for k, v in snap2.items():
            jobs.setdefault(k, v)

    return jobs


def simplify_item(video_id: str, item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": video_id,
        "trang_thai": (item.get("trang_thai") or "").strip(),
        "local_video_path": (item.get("local_video_path") or "").strip(),
        "tts_text": (item.get("tts_text") or item.get("tieu_de") or "").strip(),
        "cap_nhat_cuoi": item.get("cap_nhat_cuoi") or "",
        "_worker_lock": item.get("_worker_lock") or None,
    }


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="List candidate video jobs from Firebase RTDB.")
    ap.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    ap.add_argument("--limit", type=int, default=0, help="Limit number of jobs (0 = no limit)")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    cfg = FirebaseCfg(
        database_url=must_getenv("FIREBASE_DATABASE_URL"),
        service_account_json=must_getenv("FIREBASE_SERVICE_ACCOUNT_JSON"),
    )
    init_firebase(cfg)

    jobs = pick_candidate_jobs()
    out = [simplify_item(k, v) for k, v in jobs.items() if isinstance(v, dict)]
    out.sort(key=lambda x: (x.get("trang_thai") or "", x.get("cap_nhat_cuoi") or "", x.get("id") or ""))

    if args.limit and args.limit > 0:
        out = out[: args.limit]

    if args.pretty:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(out, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

