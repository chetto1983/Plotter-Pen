import contextlib
import os
import socket
import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8000
HOST = "127.0.0.1"
TARGET_PAGE = "plotter_pen.html"
CHROME_CANDIDATES = [
    r"C:/Program Files/Google/Chrome/Application/chrome.exe",
    r"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe"),
]

def find_port(start=DEFAULT_PORT):
    port = start
    while True:
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            if sock.connect_ex((HOST, port)) != 0:
                return port
        port += 1

class RootedRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def log_message(self, format, *args):
        return  # silence noisy logging

def open_chrome(url):
    for path in CHROME_CANDIDATES:
        if os.path.exists(path):
            webbrowser.register("chrome", None, webbrowser.BackgroundBrowser(path))
            try:
                webbrowser.get("chrome").open_new(url)
                return True
            except webbrowser.Error:
                continue
    return webbrowser.open_new(url)

def serve_and_open():
    port = find_port()
    server = ThreadingHTTPServer((HOST, port), RootedRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://{HOST}:{port}/{TARGET_PAGE}"
    print(f"Serving {ROOT_DIR} on {HOST}:{port}")
    print(f"Opening {url} ...")
    time.sleep(0.4)
    opened = open_chrome(url)
    if not opened:
        print("Could not open Chrome automatically. Please open the URL manually.")
    try:
        while thread.is_alive():
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    serve_and_open()