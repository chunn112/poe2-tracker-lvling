import argparse
import json
import os
import subprocess
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent


def game_process_paths():
    if os.name != "nt":
        return []
    command = (
        "Get-Process | "
        "Where-Object { $_.ProcessName -match 'PathOfExile|PathOfExileSteam|PathOfExile_x64|Path of Exile' } | "
        "ForEach-Object { $_.Path }"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    return [Path(line.strip()) for line in result.stdout.splitlines() if line.strip()]


def log_paths_from_game_process():
    paths = []
    for exe_path in game_process_paths():
        game_dir = exe_path.parent
        paths.extend([
            game_dir / "logs" / "Client.txt",
            game_dir / "logs" / "Kakaoclient.txt",
        ])
    return paths


def candidate_log_paths():
    paths = []
    explicit = os.environ.get("POE2_CLIENT_LOG")
    if explicit:
        paths.append(Path(explicit))

    paths.extend(log_paths_from_game_process())


    return paths


def find_log_path():
    for path in candidate_log_paths():
        try:
            if path.is_file():
                return path
        except OSError:
            continue
    return None


class TrackerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/log/status":
            self.send_log_status()
            return
        if parsed.path == "/api/log/poll":
            self.send_log_poll(parsed.query)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_log_status(self):
        path = find_log_path()
        if not path:
            self.send_json({"available": False, "size": 0})
            return
        try:
            stat = path.stat()
            self.send_json({"available": True, "size": stat.st_size, "mtime": stat.st_mtime})
        except OSError:
            self.send_json({"available": False, "size": 0})

    def send_log_poll(self, query):
        path = find_log_path()
        if not path:
            self.send_json({"available": False, "offset": 0, "chunk": ""})
            return

        params = parse_qs(query)
        try:
            offset = int(params.get("offset", ["0"])[0])
        except ValueError:
            offset = 0

        try:
            size = path.stat().st_size
            if offset < 0 or offset > size:
                offset = 0
            with path.open("rb") as handle:
                handle.seek(offset)
                data = handle.read(1024 * 1024)
            chunk = data.decode("utf-8", errors="replace")
            self.send_json({"available": True, "offset": offset + len(data), "size": size, "chunk": chunk})
        except OSError:
            self.send_json({"available": False, "offset": offset, "chunk": ""})

    def log_message(self, format, *args):
        return


def open_browser_later(url):
    time.sleep(0.6)
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/leveling.html"
    if args.open:
        threading.Thread(target=open_browser_later, args=(url,), daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), TrackerHandler)
    print(f"POE2 Leveltracker running at {url}")
    print("Close this window to stop the local service.")
    server.serve_forever()


if __name__ == "__main__":
    main()

