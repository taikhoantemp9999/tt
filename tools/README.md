## Python worker ghép lồng tiếng + chèn subtitle (Realtime DB)

Tool này đọc dữ liệu từ Firebase Realtime Database (cùng `databaseURL` như trong `app.js`), lấy video từ **đường dẫn local trong repo/máy**, gọi VBEE TTS, render bằng FFmpeg (burn subtitle `.ass` cho đẹp), rồi cập nhật trạng thái vào `tiktok_videos`.

### Mục tiêu & luồng xử lý

- **Input**: 1 record trong RTDB `tiktok_videos/{id}` có `local_video_path` + `tts_text` (hoặc `tieu_de`).
- **Output**: `videos/out/{id}/output.mp4` (kèm audio TTS + chữ đã burn-in).
- **Trạng thái**: record được đổi `trang_thai` sang `"Đang xử lý"` → `"Đã ghép lồng tiếng"` (hoặc `"Lỗi xử lý"`).

### Chuẩn bị trên máy chạy (Windows)

- Cài **FFmpeg** (để có `ffmpeg` và `ffprobe` trong PATH).
- Cài **Python 3.10+**.
- Tạo Firebase **Service Account** (Admin SDK) và tải file JSON về máy (dùng cho worker).

#### Cài FFmpeg (gợi ý nhanh)

- Tải bản FFmpeg có kèm `libass` (để burn subtitle ASS).
- Sau khi cài, mở PowerShell và kiểm tra:

```powershell
ffmpeg -version
ffprobe -version
```

### Cài đặt Python deps

```bash
python -m pip install -r tools/requirements.txt
```

### Tạo Service Account cho Firebase (Realtime Database)

Trong Firebase Console:

- **Project settings** → **Service accounts** → **Generate new private key**
- Tải file JSON về máy chạy worker.

Lưu ý: Service account cần quyền đọc/ghi RTDB của project.

### Cấu hình biến môi trường

PowerShell:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_JSON="D:\path\to\serviceAccountKey.json"
$env:FIREBASE_DATABASE_URL="https://english-fun-1937c-default-rtdb.firebaseio.com"

# VBEE (điền theo tài khoản của bạn)
$env:VBEE_API_URL="https://<vbee-endpoint>"
$env:VBEE_API_KEY="<your-key>"
$env:VBEE_VOICE_ID="<voice-id>"
```

### Chuẩn bị folder video local

Mặc định worker dùng:

- **Input base dir**: `videos/in`
- **Output base dir**: `videos/out`
- **Audio cache**: `videos/cache/tts`

Bạn có thể đặt video vào `videos/in` và ghi `local_video_path` dạng:

- `abc.mp4` (worker sẽ tìm trong `videos/in/abc.mp4`)
- `some/sub/folder/abc.mp4`
- hoặc đường dẫn tuyệt đối `D:\media\abc.mp4`

### Data tối thiểu trong mỗi record `tiktok_videos/{id}`

- `local_video_path`: đường dẫn tới video local. Có thể là relative so với repo (vd `videos/in/abc.mp4`) hoặc absolute.
- `tts_text`: câu text ngắn để đọc + chèn lên video (nếu thiếu, worker sẽ dùng `tieu_de`).

Worker chỉ pick các record có `trang_thai` là:

- `"Video gốc"`
- `"Đã ghép text"`

Ví dụ record (không bắt buộc đủ field, chỉ minh họa):

```json
{
  "tieu_de": "Mẹo tiếng Anh 10s",
  "tts_text": "Mẹo nhỏ: học 5 phút mỗi ngày.",
  "local_video_path": "abc.mp4",
  "trang_thai": "Video gốc"
}
```

Worker sẽ cập nhật:
- `trang_thai`: `"Đang xử lý"` → `"Đã ghép lồng tiếng"` hoặc `"Lỗi xử lý"`
- `local_output_path`: file output local
- `tts_audio_path`: file audio TTS local (cache)
- `xu_ly_log`: lỗi (nếu có)

Ngoài ra worker có cơ chế lock bằng field `_worker_lock` để tránh 2 máy xử lý trùng 1 record.

### Chạy worker

Chạy 1 job rồi thoát:

```bash
python tools/tts_video_worker.py --once
```

Hoặc chạy liên tục (poll):

```bash
python tools/tts_video_worker.py --poll 5
```

### Tùy chọn hữu ích

- Đổi thư mục input/output:

```bash
python tools/tts_video_worker.py --poll 5 --in-dir "D:\videos_in" --out-dir "D:\videos_out"
```

- Đặt worker id (để dễ xem log/lock):

```bash
python tools/tts_video_worker.py --poll 5 --worker-id "may-2"
```

### Troubleshooting

#### 1) Burn subtitle không chạy / báo lỗi `subtitles` / `libass`

- Nguyên nhân thường gặp: FFmpeg build không có `libass`.
- Cách kiểm tra:

```powershell
ffmpeg -filters | findstr subtitles
```

Nếu không thấy `subtitles`, hãy cài FFmpeg bản đầy đủ có `libass`.

#### 2) Worker không pick job nào

- Kiểm tra record có `trang_thai` đúng `"Video gốc"` hoặc `"Đã ghép text"`.
- Kiểm tra `FIREBASE_DATABASE_URL` đúng project.

#### 3) Báo `Input video not found`

- Kiểm tra `local_video_path` trỏ đúng file.
- Nếu dùng relative path, hãy đặt file trong `videos/in/`.

#### 4) VBEE TTS lỗi

Trong `tools/tts_video_worker.py`, hàm `vbee_tts_to_wav()` là “adapter khung”.
Nếu endpoint/param/response của VBEE khác, bạn chỉ cần chỉnh hàm này cho đúng format API của bạn.
