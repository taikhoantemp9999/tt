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


# NOTE: Hardcoded local config - edit these values directly.
# If you ever share this file, rotate keys immediately.
DEFAULT_FPT_TTS_API_KEY = "48HM12npAD38VYxgrFmuHhjBp9oPvsvt"
DEFAULT_FPT_TTS_VOICE = "banmai"
DEFAULT_FPT_TTS_SPEED = ""


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
    repo_root = Path(__file__).resolve().parents[1]
    ffprobe_bin = resolve_ffmpeg_bin(repo_root, "ffprobe.exe")

    def _to_pos_float(s: str) -> Optional[float]:
        t = (s or "").strip()
        if not t or t.upper() == "N/A":
            return None
        try:
            v = float(t)
            if math.isfinite(v) and v > 0:
                return v
        except Exception:
            return None
        return None

    # 1) Try container duration.
    p1 = subprocess.run(
        [
            ffprobe_bin,
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
    d1 = _to_pos_float(p1.stdout)
    if d1 is not None:
        return int(math.ceil(d1))

    # 2) Fallback to stream duration (some webm files don't expose format.duration).
    p2 = subprocess.run(
        [
            ffprobe_bin,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=duration",
            "-of",
            "default=nk=1:nw=1",
            str(media_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    d2 = _to_pos_float(p2.stdout)
    if d2 is not None:
        return int(math.ceil(d2))

    # 3) Fallback to duration_ts/time_base.
    p3 = subprocess.run(
        [
            ffprobe_bin,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=duration_ts,time_base",
            "-of",
            "default=nk=1:nw=1",
            str(media_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    lines = [ln.strip() for ln in (p3.stdout or "").splitlines() if ln.strip()]
    if len(lines) >= 2:
        # output order: duration_ts then time_base (typically)
        dur_ts = _to_pos_float(lines[0])
        tb = lines[1]
        if dur_ts is not None and "/" in tb:
            try:
                num, den = tb.split("/", 1)
                num_f = float(num)
                den_f = float(den)
                if den_f != 0:
                    d3 = dur_ts * (num_f / den_f)
                    if d3 > 0:
                        return int(math.ceil(d3))
            except Exception:
                pass

    raise RuntimeError(f"Cannot probe duration for media: {media_path}")


def ffmpeg_drawtext_escape_text(s: str) -> str:
    return (
        (s or "")
        .replace("\\", r"\\")
        .replace(":", r"\:")
        .replace(",", r"\,")
        .replace("%", r"\%")
        .replace("'", r"\'")
    )


def ffmpeg_filter_escape_path(p: Path) -> str:
    """
    Escape a file path for FFmpeg filter args (drawtext textfile=...).
    - FFmpeg filters treat ':' as a separator => escape it as '\\:'
    - Also escape single quotes for safety.
    """
    s = p.resolve().as_posix()
    return s.replace(":", r"\:").replace("'", r"\'")


def wrap_text_for_drawtext(text: str, max_chars_per_line: int = 26, max_lines: Optional[int] = None) -> str:
    """
    FFmpeg drawtext doesn't auto-wrap. We'll insert explicit newlines.
    Strategy: wrap by words, cap lines; if overflow, ellipsize last line.
    """
    raw = (text or "").strip()
    if not raw:
        return ""

    # Manual line breaks: user can insert '@' to force new lines.
    # Example: "a@b@c" -> ["a", "b", "c"]
    parts = [p.strip() for p in raw.split("@")]
    parts = [p for p in parts if p]
    if not parts:
        return ""

    t = " ".join(" ".join(parts).split())
    if not t:
        return ""

    def wrap_one(paragraph: str) -> list[str]:
        paragraph = " ".join((paragraph or "").split())
        if not paragraph:
            return []
        words = paragraph.split(" ")
        lines: list[str] = []
        cur: list[str] = []
        cur_len = 0

        def flush() -> None:
            nonlocal cur, cur_len
            if cur:
                lines.append(" ".join(cur))
            cur = []
            cur_len = 0

        for w in words:
            add_len = (1 if cur else 0) + len(w)
            if cur and cur_len + add_len > max_chars_per_line:
                flush()
            cur.append(w)
            cur_len = cur_len + add_len if cur_len else len(w)

        flush()
        return lines

    # Build lines respecting manual breaks first, then auto-wrap each part.
    lines: list[str] = []
    for part in parts:
        for l in wrap_one(part):
            if max_lines is not None and len(lines) >= max_lines:
                break
            lines.append(l)
        if max_lines is not None and len(lines) >= max_lines:
            break

    # If there are still words left, ellipsize the last line.
    # Detect overflow: if manual parts produce more lines than allowed OR wrapping truncated.
    total_lines_possible = sum(len(wrap_one(p)) for p in parts)
    if max_lines is not None and total_lines_possible > max_lines and lines:
        last = lines[-1].rstrip(". ")
        # Keep last line within budget (roughly)
        budget = max(8, max_chars_per_line - 1)
        if len(last) > budget:
            last = last[:budget].rstrip()
        lines[-1] = last + "…"

    return "\n".join(lines if max_lines is None else lines[:max_lines])


def choose_fontsize(text: str, base: int = 48) -> int:
    # Small heuristic: longer text => slightly smaller font.
    n = len(" ".join((text or "").split()))
    if n <= 45:
        return base
    if n <= 75:
        return max(36, base - 10)
    if n <= 110:
        return max(30, base - 16)
    return max(26, base - 20)


def rtdb_get(client: httpx.Client, db_url: str, path: str, params: Dict[str, str]) -> Dict[str, Any]:
    url = f"{db_url}/{path}.json"
    r = client.get(url, params=params)
    try:
        r.raise_for_status()
    except Exception as e:
        # Surface Firebase error body (often contains "Index not defined", permission errors, etc.)
        msg = (r.text or "").strip()
        raise RuntimeError(f"RTDB GET failed: {r.status_code} {url}\n{msg[:800]}") from e
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
    # Avoid RTDB indexed queries here because they can 400 if rules don't define indexOn.
    # Fetch all and filter locally.
    jobs = rtdb_get(client, db_url, "tiktok_videos", params={})
    best_id: Optional[str] = None
    best_key: Tuple[str, str] = ("", "")
    for vid, item in jobs.items():
        if not isinstance(item, dict):
            continue
        if (item.get("trang_thai") or "").strip() != status:
            continue
        ngay = (item.get("ngay_dang") or "").strip()
        updated = (item.get("cap_nhat_cuoi") or "").strip()
        key = (ngay, updated)
        if key >= best_key:
            best_key = key
            best_id = vid
    return best_id


def pick_all_pending_job_ids(client: httpx.Client, db_url: str, status: str = "Video gốc") -> list[str]:
    # Fetch all and filter locally.
    jobs = rtdb_get(client, db_url, "tiktok_videos", params={})
    results = []
    for vid, item in jobs.items():
        if not isinstance(item, dict):
            continue
        if (item.get("trang_thai") or "").strip() != status:
            continue
        ngay = (item.get("ngay_dang") or "").strip()
        updated = (item.get("cap_nhat_cuoi") or "").strip()
        results.append((vid, ngay, updated))

    # Sort by date, then by update time (oldest first)
    results.sort(key=lambda x: (x[1], x[2]))
    return [r[0] for r in results]


def guess_drive_download_url(item: Dict[str, Any]) -> Optional[str]:
    file_id = (item.get("drive_file_id") or "").strip()
    if file_id:
        return f"https://drive.google.com/uc?export=download&id={file_id}"
    u = (item.get("link_video_download") or "").strip()
    return u or None


def resolve_local_video_from_db(item: Dict[str, Any]) -> Optional[Path]:
    p = (item.get("local_video_path") or "").strip()
    if not p:
        return None
    try:
        cand = Path(p)
    except Exception:
        return None
    return cand if cand.exists() else None


def detect_input_video_suffix(item: Dict[str, Any], default_ext: str = ".mp4") -> str:
    """
    Pick input extension from DB filename when available.
    Supports webm/mp4/mov/mkv/... and falls back to .mp4.
    """
    raw_name = (item.get("ten_file") or "").strip()
    ext = Path(raw_name).suffix.lower() if raw_name else ""
    allowed = {
        ".mp4",
        ".webm",
        ".mov",
        ".mkv",
        ".avi",
        ".m4v",
        ".3gp",
        ".mpeg",
        ".mpg",
    }
    if ext in allowed:
        return ext
    return default_ext


def download_to_file(url: str, out_path: Path, timeout_s: int = 120) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=timeout_s, follow_redirects=True) as client:
        with client.stream("GET", url) as r:
            r.raise_for_status()
            with out_path.open("wb") as f:
                for chunk in r.iter_bytes():
                    if chunk:
                        f.write(chunk)


def apps_script_init_upload(client: httpx.Client, apps_script_url: str, filename: str, mime_type: str) -> str:
    r = client.post(
        apps_script_url,
        content=json.dumps({"action": "init", "filename": filename, "mimeType": mime_type}, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, dict) or not data.get("success"):
        raise RuntimeError(f"Apps Script init failed: {data}")
    upload_url = data.get("uploadUrl")
    if not upload_url or not isinstance(upload_url, str):
        raise RuntimeError(f"Apps Script init missing uploadUrl: {data}")
    return upload_url


def apps_script_verify(client: httpx.Client, apps_script_url: str, filename: str, retries: int = 8, sleep_s: float = 2.0) -> str:
    last: Any = None
    for _ in range(max(retries, 1)):
        r = client.post(
            apps_script_url,
            content=json.dumps({"action": "verify", "filename": filename}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        r.raise_for_status()
        data = r.json()
        last = data
        if isinstance(data, dict) and data.get("success") and data.get("found") and data.get("fileId"):
            return str(data["fileId"])
        time.sleep(sleep_s)
    raise RuntimeError(f"Apps Script verify failed for {filename}: {last}")


def upload_output_to_drive(apps_script_url: str, output_path: Path, drive_filename: str) -> str:
    if not output_path.exists():
        raise FileNotFoundError(output_path)
    with httpx.Client(timeout=600, follow_redirects=True) as client:
        upload_url = apps_script_init_upload(client, apps_script_url, drive_filename, mime_type="video/mp4")
        data = output_path.read_bytes()
        put = client.put(upload_url, content=data, headers={"Content-Type": "video/mp4"})
        # Some signed upload URLs may not allow reading response details; rely on verify.
        if put.status_code >= 400:
            raise RuntimeError(f"Upload PUT failed: {put.status_code} {put.text[:300]}")
        return apps_script_verify(client, apps_script_url, drive_filename)


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

    dur_s: Optional[int]
    try:
        dur_s = probe_duration_seconds(input_video)
    except Exception:
        # Some webm files (recorded from browser/camera) may have N/A duration metadata.
        # Fallback: let ffmpeg stop at the shortest stream (video end).
        dur_s = None
    wrapped = wrap_text_for_drawtext(text, max_chars_per_line=26, max_lines=None)
    fontsize = choose_fontsize(text, base=64)

    # Use textfile to avoid newline/escaping issues on Windows.
    # This also correctly handles Vietnamese text and manual breaks via '@'.
    textfile_path = output_video.parent / "_overlay_text.txt"
    textfile_path.parent.mkdir(parents=True, exist_ok=True)
    # Force LF newlines to avoid "double-spaced" rendering on some Windows builds.
    with textfile_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(wrapped)
    escaped_textfile = ffmpeg_filter_escape_path(textfile_path)

    drawtext = (
        "drawtext=font=Arial:"
        f"textfile='{escaped_textfile}':reload=0:"
        "x=(w-text_w)/2:y=(h*0.22)-(text_h/2):"
        f"fontsize={fontsize}:fontcolor=white:borderw=4:bordercolor=black:line_spacing=0"
    )

    output_video.parent.mkdir(parents=True, exist_ok=True)
    repo_root = Path(__file__).resolve().parents[1]
    cmd = [
        resolve_ffmpeg_bin(repo_root, "ffmpeg.exe"),
        "-y",
        "-i",
        str(input_video),
        "-i",
        str(tts_mp3),
    ]
    if dur_s is not None:
        cmd.extend(["-t", str(dur_s)])
    cmd.extend(
        [
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            drawtext,
            # Keep output duration equal to the original video.
            # If TTS audio is shorter, pad with silence so ffmpeg doesn't end early.
            "-af",
            "apad",
            # If duration metadata is unavailable, stop at video end.
            "-shortest",
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
            str(output_video),
        ]
    )
    run(cmd)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Make TikTok video using RTDB fields + TTS provider + ffmpeg.")
    ap.add_argument(
        "--database-url",
        default=os.getenv("FIREBASE_DATABASE_URL", "https://english-fun-1937c-default-rtdb.firebaseio.com"),
        help="Firebase RTDB databaseURL (same as in app.js)",
    )
    ap.add_argument("--video-id", default="", help="tiktok_videos/{id}. If empty: pick latest 'Video gốc'")
    ap.add_argument("--status", default="Video gốc", help="Status to auto-pick when --video-id empty")
    ap.add_argument("--out-dir", default="tools/out_all", help="Output base dir (single folder for easy upload)")
    ap.add_argument("--work-dir", default="tools/work", help="Working dir for downloads/cache")
    ap.add_argument(
        "--apps-script-url",
        default=os.getenv(
            "APPS_SCRIPT_UPLOAD_VIDEO_URL",
            "https://script.google.com/macros/s/AKfycbwCqKlwoNg9y-sPnkC2Lpud3c1aTFs5Nr-knSfxs9cUe2xKLgs5CkIVN-Sx3rUGEZXu4g/exec",
        ),
        help="Apps Script upload endpoint (init/verify)",
    )
    ap.add_argument(
        "--prefer-local",
        action="store_true",
        help="Prefer local_video_path when it exists (default: prefer downloading from Drive)",
    )
    ap.add_argument(
        "--fpt-api-key",
        default=DEFAULT_FPT_TTS_API_KEY,
        help="FPT TTS api-key",
    )
    ap.add_argument("--voice", default=DEFAULT_FPT_TTS_VOICE, help="FPT voice")
    ap.add_argument("--speed", default=DEFAULT_FPT_TTS_SPEED, help="FPT speed")
    return ap.parse_args()


def process_single_video(
    client: httpx.Client,
    db_url: str,
    video_id: str,
    args: argparse.Namespace,
    repo_root: Path,
    out_dir: Path,
    work_dir: Path,
) -> None:
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

    ten_file = (item.get("ten_file") or "").strip() or f"{video_id}.mp4"
    safe_base = Path(ten_file).stem
    stt = item.get("stt")
    stt_str = ""
    try:
        if stt is not None and str(stt).strip() != "":
            stt_str = f"{int(stt):04d}_"
    except Exception:
        stt_str = ""
    job_work = work_dir / video_id
    input_suffix = detect_input_video_suffix(item, default_ext=".mp4")
    input_video = job_work / f"input{input_suffix}"
    tts_mp3 = job_work / "tts.mp3"
    out_dir.mkdir(parents=True, exist_ok=True)
    output_video = out_dir / f"{stt_str}{video_id}__{safe_base}_tts.mp4"

    print(f"[db] video_id={video_id} ten_file={ten_file}")
    video_url = guess_drive_download_url(item)
    local_video = resolve_local_video_from_db(item)

    def use_local() -> None:
        if not local_video:
            raise RuntimeError("local_video_path not found or file missing")
        print(f"[local] video -> {local_video}")
        input_video.parent.mkdir(parents=True, exist_ok=True)
        input_video.write_bytes(local_video.read_bytes())

    def download_drive() -> None:
        if not video_url:
            raise RuntimeError("Missing drive_file_id/link_video_download in DB")
        print(f"[download] video -> {input_video}")
        download_to_file(video_url, input_video, timeout_s=300)

    # Default behavior: prefer downloading from Drive (so you don't need local files).
    if args.prefer_local and local_video:
        try:
            use_local()
        except Exception:
            download_drive()
    else:
        try:
            download_drive()
        except Exception as e:
            print(f"[warn] drive download failed, trying local if available: {e}")
            use_local()

    print("[tts] create audio from title with provider=fpt...")
    audio_url = fpt_tts_create(args.fpt_api_key, title, voice=args.voice, speed=args.speed)
    print(f"[tts] audio_url={audio_url}")

    print(f"[download] audio -> {tts_mp3}")
    poll_download_audio(audio_url, tts_mp3, max_wait_s=120)

    print(f"[ffmpeg] render -> {output_video}")
    render_video_with_tts_and_text(input_video, tts_mp3, title, output_video)

    print("[drive] upload output to Drive...")
    out_drive_name = f"{safe_base}_tts.mp4"
    out_file_id = upload_output_to_drive(args.apps_script_url, output_video, out_drive_name)
    out_view = f"https://drive.google.com/file/d/{out_file_id}/view"
    out_dl = f"https://drive.google.com/uc?id={out_file_id}&export=download"

    patch = {
        "trang_thai": "Chờ đăng",
        "tts_text": title,
        "tts_provider": "fpt",
        "tts_audio_url": audio_url,
        "local_input_video_path": str(input_video),
        "local_tts_mp3_path": str(tts_mp3),
        "local_output_path": str(output_video),
        "output_ten_file": out_drive_name,
        "output_drive_file_id": out_file_id,
        "output_link_video": out_view,
        "output_link_video_download": out_dl,
        "xu_ly_xong_luc": utc_now_iso(),
    }
    rtdb_patch(client, db_url, f"tiktok_videos/{video_id}", patch)
    print(f"Done: {output_video}")


def main() -> int:
    ensure_utf8_stdout()
    args = parse_args()
    db_url = normalize_db_url(args.database_url)

    if not args.fpt_api_key:
        raise RuntimeError("Missing FPT key: edit DEFAULT_FPT_TTS_API_KEY or pass --fpt-api-key")

    repo_root = Path(__file__).resolve().parents[1]
    out_dir = (repo_root / args.out_dir).resolve()
    work_dir = (repo_root / args.work_dir).resolve()

    with httpx.Client(timeout=30, follow_redirects=True) as client:
        video_id_arg = (args.video_id or "").strip()
        if video_id_arg:
            video_ids = [video_id_arg]
        else:
            print(f"Scanning for videos with status={args.status!r}...")
            video_ids = pick_all_pending_job_ids(client, db_url, status=args.status)
            if not video_ids:
                print(f"No job found with status={args.status!r}")
                return 0

        print(f"Found {len(video_ids)} videos to process.")
        success_count = 0
        error_count = 0

        for i, video_id in enumerate(video_ids, start=1):
            print(f"\n[{i}/{len(video_ids)}] Processing: {video_id}")
            try:
                process_single_video(client, db_url, video_id, args, repo_root, out_dir, work_dir)
                success_count += 1
            except Exception as e:
                error_count += 1
                err_msg = str(e)
                print(f"Error processing {video_id}: {err_msg}")
                try:
                    rtdb_patch(
                        client,
                        db_url,
                        f"tiktok_videos/{video_id}",
                        {
                            "trang_thai": "Lỗi xử lý",
                            "xu_ly_log": err_msg[:2000],
                            "cap_nhat_cuoi": utc_now_iso(),
                        },
                    )
                except Exception as ex:
                    print(f"Failed to update error status for {video_id}: {ex}")

        print(f"\nBatch finished. Success: {success_count}, Errors: {error_count}")
        return 0 if error_count == 0 else 1


if __name__ == "__main__":
    ensure_utf8_stdout()
    raise SystemExit(main())

