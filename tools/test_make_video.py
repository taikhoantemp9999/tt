import argparse
import json
import math
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_utf8_stdout() -> None:
    # Ensure argparse/help can print Vietnamese on Windows consoles.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def normalize_db_url(database_url: str) -> str:
    u = (database_url or "").strip().rstrip("/")
    if not u:
        raise ValueError("database_url is empty")
    if not (u.startswith("http://") or u.startswith("https://")):
        u = "https://" + u
    return u


def run(cmd: list[str]) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        print(" ".join(cmd))
    except UnicodeEncodeError:
        print("Running ffmpeg...")
    subprocess.run(cmd, check=True)


def resolve_ffmpeg_bin(repo_root: Path, exe_name: str) -> str:
    """
    Prefer bundled FFmpeg in tools/ffmpeg/bin on Windows; fall back to PATH.
    """
    bundled = (repo_root / "tools" / "ffmpeg" / "bin" / exe_name)
    if bundled.exists():
        return str(bundled)
    return exe_name.replace(".exe", "")


def probe_duration_seconds(media_path: Path) -> int:
    p = subprocess.run(
        [
            resolve_ffmpeg_bin(Path(__file__).resolve().parents[1], "ffprobe.exe"),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nk=1:nw=1",
            str(media_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    dur = float(p.stdout.strip())
    return int(math.ceil(dur))


def ffmpeg_drawtext_escape_text(s: str) -> str:
    return (
        (s or "")
        .replace("\\", r"\\")
        .replace(":", r"\:")
        .replace(",", r"\,")
        .replace("%", r"\%")
        .replace("'", r"\'")
    )


def rtdb_get(client: httpx.Client, db_url: str, path: str, params: Dict[str, str]) -> Dict[str, Any]:
    url = f"{db_url}/{path}.json"
    r = client.get(url, params=params)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def rtdb_patch(client: httpx.Client, db_url: str, path: str, patch: Dict[str, Any]) -> None:
    url = f"{db_url}/{path}.json"
    r = client.patch(url, json=patch)
    r.raise_for_status()


def fetch_video_by_id(client: httpx.Client, db_url: str, video_id: str) -> Dict[str, Any]:
    url = f"{db_url}/tiktok_videos/{video_id}.json"
    r = client.get(url)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def pick_latest_job_id(client: httpx.Client, db_url: str, status: str = "Video gốc") -> Optional[str]:
    params = {"orderBy": json.dumps("trang_thai", ensure_ascii=False), "equalTo": json.dumps(status, ensure_ascii=False)}
    jobs = rtdb_get(client, db_url, "tiktok_videos", params)
    best_id: Optional[str] = None
    best_key: Tuple[str, str] = ("", "")
    for vid, item in jobs.items():
        if not isinstance(item, dict):
            continue
        ngay = (item.get("ngay_dang") or "").strip()
        updated = (item.get("cap_nhat_cuoi") or "").strip()
        key = (ngay, updated)
        if key >= best_key:
            best_key = key
            best_id = vid
    return best_id


def guess_drive_download_url(item: Dict[str, Any]) -> Optional[str]:
    file_id = (item.get("drive_file_id") or "").strip()
    if file_id:
        return f"https://drive.google.com/uc?export=download&id={file_id}"
    u = (item.get("link_video_download") or "").strip()
    return u or None


def download_to_file(url: str, out_path: Path, timeout_s: int = 120) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=timeout_s, follow_redirects=True) as client:
        with client.stream("GET", url) as r:
            r.raise_for_status()
            with out_path.open("wb") as f:
                for chunk in r.iter_bytes():
                    if chunk:
                        f.write(chunk)


def fpt_tts_create(api_key: str, text: str, voice: str, speed: str) -> str:
    url = "https://api.fpt.ai/hmi/tts/v5"
    headers = {"api-key": api_key, "voice": voice, "speed": speed}
    with httpx.Client(timeout=60) as client:
        r = client.post(url, content=text.encode("utf-8"), headers=headers)
        r.raise_for_status()
        # Usually returns JSON like {"async":"https://...mp3","error":0,...}
        try:
            data = r.json()
        except Exception:
            raise RuntimeError(f"FPT TTS: Unexpected response: {r.text[:500]}")
        audio_url = data.get("async") or data.get("url") or data.get("audio_url")
        if not audio_url or not isinstance(audio_url, str):
            raise RuntimeError(f"FPT TTS: Missing audio url. Response keys: {list(data.keys())}")
        return audio_url


def poll_download_audio(audio_url: str, out_mp3: Path, max_wait_s: int = 90) -> None:
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + max_wait_s
    last_err: Optional[str] = None
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        while time.time() < deadline:
            try:
                r = client.get(audio_url)
                if r.status_code >= 400:
                    last_err = f"{r.status_code}: {r.text[:200]}"
                    time.sleep(2)
                    continue
                ctype = (r.headers.get("content-type") or "").lower()
                if "audio" not in ctype and not r.content:
                    last_err = f"Unexpected content-type: {ctype}"
                    time.sleep(2)
                    continue
                out_mp3.write_bytes(r.content)
                if out_mp3.stat().st_size < 2000:
                    last_err = "Downloaded audio too small"
                    time.sleep(2)
                    continue
                return
            except Exception as e:
                last_err = str(e)
                time.sleep(2)
    raise RuntimeError(f"Timeout downloading TTS audio: {last_err or audio_url}")


def render_video_with_tts_and_text(input_video: Path, tts_mp3: Path, text: str, output_video: Path) -> None:
    if not input_video.exists():
        raise FileNotFoundError(input_video)
    if not tts_mp3.exists():
        raise FileNotFoundError(tts_mp3)

    dur_s = probe_duration_seconds(input_video)
    escaped_text = ffmpeg_drawtext_escape_text(text)
    drawtext = (
        "drawtext=font=Arial:"
        f"text='{escaped_text}':"
        "x=(w-text_w)/2:y=(h/3)-(text_h/2):"
        "fontsize=48:fontcolor=white:borderw=4:bordercolor=black"
    )

    output_video.parent.mkdir(parents=True, exist_ok=True)
    repo_root = Path(__file__).resolve().parents[1]
    run(
        [
            resolve_ffmpeg_bin(repo_root, "ffmpeg.exe"),
            "-y",
            "-i",
            str(input_video),
            "-i",
            str(tts_mp3),
            "-t",
            str(dur_s),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            drawtext,
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output_video),
        ]
    )


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Make TikTok video using RTDB fields + FPT TTS + ffmpeg.")
    ap.add_argument(
        "--database-url",
        default=os.getenv("FIREBASE_DATABASE_URL", "https://english-fun-1937c-default-rtdb.firebaseio.com"),
        help="Firebase RTDB databaseURL (same as in app.js)",
    )
    ap.add_argument("--video-id", default="", help="tiktok_videos/{id}. If empty: pick latest 'Video gốc'")
    ap.add_argument("--status", default="Video gốc", help="Status to auto-pick when --video-id empty")
    ap.add_argument("--out-dir", default="tools/out", help="Output base dir")
    ap.add_argument("--work-dir", default="tools/work", help="Working dir for downloads/cache")
    ap.add_argument("--fpt-api-key", default=os.getenv("FPT_TTS_API_KEY", ""), help="FPT TTS api-key (env recommended)")
    ap.add_argument("--voice", default=os.getenv("FPT_TTS_VOICE", "banmai"), help="FPT voice")
    ap.add_argument("--speed", default=os.getenv("FPT_TTS_SPEED", ""), help="FPT speed")
    return ap.parse_args()


def main() -> int:
    ensure_utf8_stdout()
    args = parse_args()
    db_url = normalize_db_url(args.database_url)

    if not args.fpt_api_key:
        raise RuntimeError("Missing FPT_TTS_API_KEY (pass --fpt-api-key or set env var)")

    repo_root = Path(__file__).resolve().parents[1]
    out_dir = (repo_root / args.out_dir).resolve()
    work_dir = (repo_root / args.work_dir).resolve()

    with httpx.Client(timeout=30, follow_redirects=True) as client:
        video_id = (args.video_id or "").strip()
        if not video_id:
            picked = pick_latest_job_id(client, db_url, status=args.status)
            if not picked:
                print(f"No job found with status={args.status!r}")
                return 0
            video_id = picked

        item = fetch_video_by_id(client, db_url, video_id)
        if not item:
            raise RuntimeError(f"Video id not found: {video_id}")

        title = (item.get("tieu_de") or "").strip()
        if not title:
            raise RuntimeError("Missing field tieu_de in DB")

        # Mark processing (best-effort)
        try:
            rtdb_patch(
                client,
                db_url,
                f"tiktok_videos/{video_id}",
                {"trang_thai": "Đang xử lý", "cap_nhat_cuoi": utc_now_iso()},
            )
        except Exception:
            pass

        video_url = guess_drive_download_url(item)
        if not video_url:
            raise RuntimeError("Missing drive_file_id or link_video_download in DB")

        ten_file = (item.get("ten_file") or "").strip() or f"{video_id}.mp4"
        safe_base = Path(ten_file).stem
        job_work = work_dir / video_id
        job_out = out_dir / video_id
        input_video = job_work / "input.mp4"
        tts_mp3 = job_work / "tts.mp3"
        output_video = job_out / f"{safe_base}_tts.mp4"

        print(f"[db] video_id={video_id} ten_file={ten_file}")
        print(f"[download] video -> {input_video}")
        download_to_file(video_url, input_video, timeout_s=300)

        print("[tts] create audio from title...")
        audio_url = fpt_tts_create(args.fpt_api_key, title, voice=args.voice, speed=args.speed)
        print(f"[tts] audio_url={audio_url}")

        print(f"[download] audio -> {tts_mp3}")
        poll_download_audio(audio_url, tts_mp3, max_wait_s=120)

        print(f"[ffmpeg] render -> {output_video}")
        render_video_with_tts_and_text(input_video, tts_mp3, title, output_video)

        patch = {
            "trang_thai": "Đã ghép lồng tiếng",
            "tts_text": title,
            "tts_audio_url": audio_url,
            "local_input_video_path": str(input_video),
            "local_tts_mp3_path": str(tts_mp3),
            "local_output_path": str(output_video),
            "xu_ly_xong_luc": utc_now_iso(),
        }
        rtdb_patch(client, db_url, f"tiktok_videos/{video_id}", patch)

        print(f"Done: {output_video}")
        return 0


if __name__ == "__main__":
    ensure_utf8_stdout()
    raise SystemExit(main())

