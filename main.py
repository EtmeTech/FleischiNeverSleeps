import http.server
import os
import socketserver
import subprocess
import sys
import threading
import time

PORT = 8080
PUBLIC_DIR = "public"

class NoCacheHTTPServer(socketserver.TCPServer):
    allow_reuse_address = True

class GameHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def start_server():
    with NoCacheHTTPServer(("127.0.0.1", PORT), GameHTTPHandler) as httpd:
        httpd.serve_forever()

def launch_app():
    bust = int(time.time())
    url = f"http://127.0.0.1:{PORT}/index.html?v={bust}"
    if sys.platform.startswith("linux"):
        subprocess.run([
            "chromium-browser",
            f"--app={url}",
            "--start-fullscreen",
            "--no-first-run",
            "--disable-pinch",
            "--disk-cache-dir=/dev/null",
            "--disk-cache-size=1"
        ])
    elif sys.platform == "win32":
        subprocess.run(f'start msedge --app="{url}" --start-fullscreen', shell=True)

if __name__ == "__main__":
    threading.Thread(target=start_server, daemon=True).start()
    launch_app()
