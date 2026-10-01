#!/usr/bin/env python3
"""
시작하는 자리. web/ 폴더를 작은 웹 서버로 띄우고 조작 화면을 연다.

  python3 serve.py                 마이크로 켠다
  python3 serve.py --sim           마이크 대신 시험용 녹음을 관객의 목소리로 쓴다
  python3 serve.py --auto          체험을 끝없이 되풀이한다 (--sim 과 함께 쓰면 시연용)
  python3 serve.py --offline 30    시험용 녹음으로 한 바퀴 돌며 30초를 out.mp4(또는 out.webm)로 적고 끝낸다
  python3 serve.py --host 0.0.0.0  폰이나 다른 컴퓨터에서 본다 (마이크는 이 컴퓨터에서만 열린다)
  python3 serve.py --port 7001     포트를 바꾼다. 쓰이고 있으면 다음 빈 번호를 찾는다

전시 화면은 조작 화면의 「전시 화면 열기」로 띄운다. 주소는 같은 서버의 /display.html 이다.

파이썬에 들어 있는 것만 쓴다. 따로 설치할 것이 없다.
보통 웹 서버와 다른 점은 둘이다. 브라우저가 옛 파일을 들고 있지 않게 하고(rule.js 를 고치면
새로 고침만으로 보이게), --offline 녹화를 받아 파일로 적는다.
녹음된 목소리는 이 서버로 오지 않는다. 브라우저 메모리에만 있다가 체험이 끝나면 버려진다.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import re
import platform
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).parent
WEB = HERE / "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".flac": "audio/flac",
        ".mp4": "video/mp4",
    }
    on_saved = None  # --offline 일 때 파일을 받으면 부른다

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # 영상의 한 시점으로 넘어가려면(seek) 브라우저가 파일의 일부만 달라고 한다(Range).
    # 파이썬 기본 서버는 이것을 몰라 영상이 늘 0초에 머문다. 그래서 여기서 받아 준다.
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        if m.group(1):
            start, end = int(m.group(1)), int(m.group(2)) if m.group(2) else size - 1
        else:
            start, end = max(0, size - int(m.group(2))), size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, source, outputfile) -> None:
        left = getattr(self, "_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        self._left = None
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)

    def do_POST(self) -> None:
        # 이 컴퓨터에서 온 것만 받는다: --offline 녹화, 그리고 처음 잰 얼굴 영상의 랜드마크
        url = urlparse(self.path)
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(404)
            return
        if url.path == "/save-landmarks":
            name = parse_qs(url.query).get("name", [""])[0]
            if not re.fullmatch(r"[\w.-]+\.lm\.json", name):
                self.send_error(400)
                return
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            (WEB / "faces" / name).write_bytes(body)
            self.send_response(200)
            self.end_headers()
            print(f"얼굴 영상의 랜드마크를 저장했습니다: web/faces/{name}")
            return
        if url.path != "/save":
            self.send_error(404)
            return
        ext = parse_qs(url.query).get("ext", ["webm"])[0]
        ext = ext if ext in ("mp4", "webm") else "webm"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        out = HERE / f"out.{ext}"
        out.write_bytes(body)
        self.send_response(200)
        self.end_headers()
        print(f"{out.name} 에 적었습니다 ({len(body) / 1e6:.1f}MB).")
        if Handler.on_saved:
            Handler.on_saved()

    def log_message(self, *args) -> None:  # 요청마다 줄이 쌓이면 오류가 묻힌다
        pass


def open_browser(url: str) -> None:
    # 맥이면 크롬을 먼저 찾는다. 사파리도 되지만 크롬에서 가장 많이 시험했다.
    if platform.system() == "Darwin":
        if subprocess.run(["open", "-a", "Google Chrome", url], capture_output=True).returncode == 0:
            return
    webbrowser.open(url)


def bind(host: str, port: int) -> http.server.ThreadingHTTPServer:
    """포트가 쓰이고 있으면 다음 번호를 찾는다. 같은 것을 두 번 켜도 겹치지 않는다."""
    handler = functools.partial(Handler, directory=str(WEB))
    for p in range(port, port + 20):
        try:
            return http.server.ThreadingHTTPServer((host, p), handler)
        except OSError:
            continue
    print(f"{port}~{port + 19} 번이 모두 쓰이고 있습니다. --port 로 다른 번호를 주세요.")
    raise SystemExit(1)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # 자동 시작 로그 파일에도 바로 적히게
    ap = argparse.ArgumentParser(description="목소리 얼굴 페이지를 띄운다")
    ap.add_argument("--sim", action="store_true", help="마이크 대신 시험용 녹음으로")
    ap.add_argument("--auto", action="store_true", help="체험을 끝없이 되풀이한다")
    ap.add_argument("--offline", type=float, default=0, help="초 단위. 장비 없이 그만큼을 out.mp4 로 적고 끝낸다")
    ap.add_argument("--host", default="127.0.0.1", help="다른 기기에서 보려면 0.0.0.0")
    ap.add_argument("--port", type=int, default=7000)
    ap.add_argument("--no-open", action="store_true", help="브라우저를 열지 않는다 (라즈베리파이 자동 시작용)")
    ap.add_argument("--query", default="", help="주소 뒤에 그대로 붙일 것")
    args = ap.parse_args()

    q = []
    if args.offline:
        q.append(f"offline={args.offline:g}")
    elif args.sim:
        q.append("sim")
    if args.auto and not args.offline:
        q.append("auto")
    if args.query:
        q.append(args.query)

    server = bind(args.host, args.port)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/" + ("?" + "&".join(q) if q else "")

    if (args.sim or args.offline) and not (WEB / "sample" / "목소리.flac").exists():
        print("시험용 녹음이 없습니다. 받기:  python3 fetch_assets.py")

    if args.offline:
        Handler.on_saved = lambda: threading.Thread(target=server.shutdown).start()
        print(f"{args.offline:g}초 동안을 녹화합니다. 브라우저가 열렸다가 끝나면 out 파일이 생깁니다.")
    else:
        print(f"열렸습니다: {url}")
        if args.host == "0.0.0.0":
            print(f"다른 기기에서는 이 컴퓨터의 주소로 엽니다(포트 {port}). 마이크는 https 가 아니라서 열리지 않습니다.")
        print("끝내려면 Ctrl+C (창을 닫아도 됩니다)")
    if not args.no_open:
        threading.Timer(0.8, open_browser, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()
