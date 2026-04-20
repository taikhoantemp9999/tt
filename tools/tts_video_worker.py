import argparse
import hashlib
import json
import os
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

import firebase_admin
from firebase_admin import credentials, db


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def must_getenv(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed ({p.returncode}): {shlex.join(cmd)}\n{p.stdout}")


def probe_duration_seconds(media_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(media_path),
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {media_path}\n{p.stdout}")
    data = json.loads(p.stdout)
    dur = float(data["format"]["duration"])
    return max(dur, 0.0)


def ass_time(seconds: float) -> str:
    # h:mm:ss.cc (centiseconds)
    if seconds < 0:
        seconds = 0
    cs = int(round(seconds * 100))
    s = cs // 100
    cc = cs % 100
    h = s // 3600
    m = (s % 3600) // 60
    ss = s % 60
    return f"{h}:{m:02d}:{ss:02d}.{cc:02d}"


def escape_ass_text(text: str) -> str:
    # Minimal escaping for ASS dialogue text.
    return (
        (text or "")
        .replace("\r\n", "\\N")
        .replace("\n", "\\N")
        .replace("\r", "\\N")
        .replace("{", "\\{")
        .replace("}", "\\}")
    )


def build_ass(
    text: str,
    start_s: float,
    end_s: float,
    font: str = "Be Vietnam Pro",
    font_size: int = 54,
    primary_color_ass: str = "&H00FFFFFF",  # BBGGRR with &HAABBGGRR (we keep AA=00)
    outline_color_ass: str = "&H00000000",
    shadow: int = 2,
    outline: int = 5,
    margin_v: int = 90,
    fade_ms: int = 180,
) -> str:
    # ASS colors are &HAABBGGRR. Using white/black defaults for readability.
    text = escape_ass_text(text.strip())
    if not text:
        text = " "

    start = ass_time(start_s)
    end = ass_time(end_s)

    # Alignment 2 = bottom-center
    # BorderStyle 1 = outline + shadow
    # Bold -1 = true
    style = (
        f"Style: Default,{font},{font_size},{primary_color_ass},{primary_color_ass},"
        f"{outline_color_ass},{outline_color_ass},-1,0,0,0,100,100,0,0,1,{outline},"
        f"{shadow},2,10,10,{margin_v},1"
    )

    # Add a subtle fade in/out for nicer feel.
    override = f"{{\\fad({fade_ms},{fade_ms})}}"
    dialogue = f"Dialogue: 0,{start},{end},Default,,0,0,0,,{override}{text}"

    return "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            "PlayResX: 1080",
            "PlayResY: 1920",
            "WrapStyle: 2",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
            style,
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
            dialogue,
            "",
        ]
    )


@dataclass
class WorkerConfig:
    worker_id: str
    repo_root: Path
    in_base_dir: Path
    out_base_dir: Path
    audio_cache_dir: Path
    database_url: str
    service_account_json: Path
    vbee_api_url: str
    vbee_api_key: str
    vbee_voice_id: str
    lock_timeout_s: int = 60 * 45


def init_firebase(cfg: WorkerConfig) -> None:
    if firebase_admin._apps:
        return
    cred = credentials.Certificate(str(cfg.service_account_json))
    firebase_admin.initialize_app(cred, {"databaseURL": cfg.database_url})


def resolve_local_video_path(cfg: WorkerConfig, local_video_path: str) -> Path:
    p = Path(local_video_path)
    if not p.is_absolute():
        # Prefer in_base_dir, fall back to repo root.
        cand = cfg.in_base_dir / p
        if cand.exists():
            return cand
        cand2 = cfg.repo_root / p
        return cand2
    return p


def lock_job(video_id: str, worker_id: str, now_ts: float, lock_timeout_s: int) -> bool:
    ref = db.reference("tiktok_videos").child(video_id)

    def txn(current: Optional[Dict[str, Any]]):
        if not current:
            return current
        trang_thai = (current.get("trang_thai") or "").strip()
        if trang_thai not in ("Video gốc", "Đã ghép text"):
            return current

        lock = current.get("_worker_lock") or {}
        locked_by = lock.get("by")
        locked_at = lock.get("at_ts")
        if locked_at is not None:
            try:
                locked_at = float(locked_at)
            except Exception:
                locked_at = None

        if locked_at is not None and (now_ts - locked_at) < lock_timeout_s and locked_by and locked_by != worker_id:
            return current

        current["_worker_lock"] = {"by": worker_id, "at_ts": now_ts, "at": utc_now_iso()}
        current["trang_thai"] = "Đang xử lý"
        current["cap_nhat_cuoi"] = utc_now_iso()
        return current

    result = ref.transaction(txn)
    return bool(result and (result.get("_worker_lock") or {}).get("by") == worker_id and result.get("trang_thai") == "Đang xử lý")


def update_job(video_id: str, patch: Dict[str, Any]) -> None:
    patch = dict(patch)
    patch["cap_nhat_cuoi"] = utc_now_iso()
    db.reference("tiktok_videos").child(video_id).update(patch)


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def vbee_tts_to_wav(cfg: WorkerConfig, text: str, out_wav_path: Path) -> None:
    """
    Adapter VBEE TTS -> WAV.

    Vì mỗi tài khoản VBEE có thể khác endpoint/params, hàm này viết theo dạng "khung".
    Bạn chỉ cần chỉnh payload/headers để phù hợp API bạn đang dùng.
    """
    out_wav_path.parent.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": f"Bearer {cfg.vbee_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "voice_id": cfg.vbee_voice_id,
        "format": "wav",
    }

    with httpx.Client(timeout=120) as client:
        r = client.post(cfg.vbee_api_url, headers=headers, json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"VBEE TTS error {r.status_code}: {r.text[:500]}")

        # Common patterns:
        # - response is raw bytes audio
        # - OR JSON with {url: "..."} to download
        ctype = (r.headers.get("content-type") or "").lower()
        if "application/json" in ctype:
            data = r.json()
            url = data.get("url") or data.get("audio_url") or data.get("data")
            if not url or not isinstance(url, str):
                raise RuntimeError(f"VBEE JSON response missing audio url. Keys: {list(data.keys())}")
            rr = client.get(url)
            rr.raise_for_status()
            out_wav_path.write_bytes(rr.content)
        else:
            out_wav_path.write_bytes(r.content)


def render_video(cfg: WorkerConfig, input_video: Path, tts_wav: Path, ass_path: Path, output_video: Path) -> None:
    output_video.parent.mkdir(parents=True, exist_ok=True)
    ass_path.parent.mkdir(parents=True, exist_ok=True)

    # Burn subtitles + replace audio with TTS audio
    # Note: If your ffmpeg build lacks libass, install a full build.
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_video),
        "-i",
        str(tts_wav),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        f"subtitles={str(ass_path)}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(output_video),
    ]
    run(cmd)


def pick_candidate_jobs() -> Dict[str, Dict[str, Any]]:
    # We pick from "Video gốc" and "Đã ghép text" (if you already have text ready).
    base = db.reference("tiktok_videos")
    jobs: Dict[str, Dict[str, Any]] = {}

    snap1 = base.order_by_child("trang_thai").equal_to("Video gốc").get() or {}
    if isinstance(snap1, dict):
        jobs.update(snap1)

    snap2 = base.order_by_child("trang_thai").equal_to("Đã ghép text").get() or {}
    if isinstance(snap2, dict):
        # don't overwrite existing keys (shouldn't happen)
        for k, v in snap2.items():
            jobs.setdefault(k, v)

    return jobs


def process_one(cfg: WorkerConfig, video_id: str, item: Dict[str, Any]) -> None:
    local_video_path = (item.get("local_video_path") or "").strip()
    tts_text = (item.get("tts_text") or item.get("tieu_de") or "").strip()
    if not local_video_path:
        raise RuntimeError("Missing field local_video_path")
    if not tts_text:
        raise RuntimeError("Missing field tts_text (or tieu_de)")

    input_video = resolve_local_video_path(cfg, local_video_path)
    if not input_video.exists():
        raise RuntimeError(f"Input video not found: {input_video}")

    text_hash = sha1(f"{cfg.vbee_voice_id}::{tts_text}")
    tts_wav = cfg.audio_cache_dir / f"{text_hash}.wav"
    if not tts_wav.exists():
        vbee_tts_to_wav(cfg, tts_text, tts_wav)

    audio_dur = probe_duration_seconds(tts_wav)
    if audio_dur <= 0.2:
        raise RuntimeError(f"TTS audio duration too small: {audio_dur}s")

    work_dir = cfg.out_base_dir / video_id
    ass_path = work_dir / "subtitle.ass"
    ass_path.write_text(build_ass(tts_text, 0.0, audio_dur), encoding="utf-8")

    output_video = work_dir / "output.mp4"
    render_video(cfg, input_video=input_video, tts_wav=tts_wav, ass_path=ass_path, output_video=output_video)

    update_job(
        video_id,
        {
            "trang_thai": "Đã ghép lồng tiếng",
            "local_output_path": str(output_video),
            "tts_audio_path": str(tts_wav),
            "xu_ly_xong_luc": utc_now_iso(),
            "xu_ly_worker": cfg.worker_id,
            "xu_ly_log": "",
        },
    )


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="Process at most one job then exit")
    ap.add_argument("--poll", type=int, default=0, help="Poll interval seconds (0 = no poll)")
    ap.add_argument("--in-dir", default="videos/in", help="Base dir for relative local_video_path")
    ap.add_argument("--out-dir", default="videos/out", help="Base dir for outputs")
    ap.add_argument("--audio-cache", default="videos/cache/tts", help="Cache dir for TTS audio")
    ap.add_argument("--worker-id", default=f"py-worker-{os.getpid()}", help="Worker id for locking")
    return ap.parse_args()


def build_config(args: argparse.Namespace) -> WorkerConfig:
    repo_root = Path(__file__).resolve().parents[1]
    return WorkerConfig(
        worker_id=args.worker_id,
        repo_root=repo_root,
        in_base_dir=(repo_root / args.in_dir).resolve(),
        out_base_dir=(repo_root / args.out_dir).resolve(),
        audio_cache_dir=(repo_root / args.audio_cache).resolve(),
        database_url=must_getenv("FIREBASE_DATABASE_URL"),
        service_account_json=Path(must_getenv("FIREBASE_SERVICE_ACCOUNT_JSON")).resolve(),
        vbee_api_url=must_getenv("VBEE_API_URL"),
        vbee_api_key=must_getenv("VBEE_API_KEY"),
        vbee_voice_id=must_getenv("VBEE_VOICE_ID"),
    )


def main() -> int:
    args = parse_args()
    cfg = build_config(args)
    init_firebase(cfg)

    cfg.in_base_dir.mkdir(parents=True, exist_ok=True)
    cfg.out_base_dir.mkdir(parents=True, exist_ok=True)
    cfg.audio_cache_dir.mkdir(parents=True, exist_ok=True)

    while True:
        jobs = pick_candidate_jobs()
        if not jobs:
            if args.poll and not args.once:
                time.sleep(args.poll)
                continue
            return 0

        processed_any = False
        for video_id, item in jobs.items():
            now_ts = time.time()
            if not lock_job(video_id, cfg.worker_id, now_ts, cfg.lock_timeout_s):
                continue

            processed_any = True
            try:
                process_one(cfg, video_id, item)
            except Exception as e:
                update_job(
                    video_id,
                    {
                        "trang_thai": "Lỗi xử lý",
                        "xu_ly_worker": cfg.worker_id,
                        "xu_ly_log": str(e)[:1500],
                    },
                )
            finally:
                # Keep lock info for debugging; next run can reclaim if lock expires.
                pass

            if args.once:
                return 0

        if not processed_any and args.poll and not args.once:
            time.sleep(args.poll)
        elif not args.poll and not args.once:
            # No polling; exit after scanning.
            return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
