# POE2 Leveltracker

Tracker leveling cho Path of Exile 2, có overlay Picture-in-Picture và tự đồng bộ zone.

## Yêu cầu

- Windows.
- Python 3 để chạy local service `server.py`.
  - Tải Python tại trang chính thức: https://www.python.org/downloads/windows/
  - Khi cài Python, nên tick `Add python.exe to PATH`.
  - Kiểm tra sau khi cài:

```powershell
python --version
```

  - Nếu máy dùng Python Launcher, có thể kiểm tra bằng:

```powershell
py -3 --version
```

- Trình duyệt Chromium-based như Chrome hoặc Edge để dùng Picture-in-Picture tốt nhất.

## Cách chạy

1. Mở Path of Exile 2.
2. Chạy file:

```bat
start.bat
```

3. Browser sẽ tự mở:

```text
http://127.0.0.1:8787/leveling.html
```

Không cần mở trực tiếp `leveling.html`. Bản release dùng local service để đọc game log, nên hãy chạy bằng `start.bat`.

## Cách sử dụng

- Bấm `EN / VI` để đổi ngôn ngữ giao diện.
- Bấm `Overlay` để mở overlay theo dõi leveling.
- Bật `Auto advance` sang `On` để tracker tự đọc zone hiện tại và chuyển step khi vào đúng target area.
- Tắt `Auto advance` sang `Off` để dừng watcher.
- Dùng `Back`, `Next`, `Reset`, `Sync current` để điều chỉnh step thủ công.
- Bật `Show optional steps` nếu muốn hiện các bước optional.


## Lưu ý

- Game cần đang chạy trước khi bật `Auto advance`.
- Nếu tracker không detect zone, hãy tắt rồi bật lại `Auto advance`.
- Nếu browser không mở, mở thủ công `http://127.0.0.1:8787/leveling.html` sau khi chạy `start.bat`.
- Đóng cửa sổ local service để tắt tracker server.
