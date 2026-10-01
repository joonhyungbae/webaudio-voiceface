#!/usr/bin/env python3
"""
얼굴 랜드마크 모델, 말하는 영상, 시험용 녹음을 받는다. 설치(install.sh)가 대신 해 준다.

  python fetch_assets.py     → web/models/face_landmarker.task (약 4MB)
                               web/faces/NN.mp4  faces.json 에 적힌 말하는 영상 (편당 4MB 안팎)
                               web/sample/목소리.flac (약 1MB, 마이크 없이 돌려 볼 때)

말하는 영상은 이 저장소의 릴리스(faces-v1)에서 받는다. 자기 영상으로 바꿨다면 web/faces/ 에 이미 있으므로 건너뛴다.

이미 받았으면 건너뛴다. 받은 파일은 저장소에 올라가지 않는다(.gitignore).
MediaPipe 라이브러리는 저장소에 들어 있어(web/vendor/mediapipe) 따로 받지 않는다.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

WEB = Path(__file__).parent / "web"
MODEL = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
         "models/face_landmarker.task")
VIDEOS = "https://github.com/joonhyungbae/webaudio-voiceface/releases/download/faces-v1"
SAMPLE = ("https://upload.wikimedia.org/wikipedia/commons/a/ac/Ko_Colijn_voice_-_nl.flac", "sample/목소리.flac")
CREDIT = """목소리.flac
출처: 위키미디어 공용, Vera de Kok 녹음 (네덜란드어로 말하는 남성 목소리, 22초)
https://commons.wikimedia.org/wiki/File:Ko_Colijn_voice_-_nl.flac
라이선스: CC0 1.0 (퍼블릭 도메인 헌정)
"""


def get(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "voiceface/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
    except Exception:
        # 맥의 python.org 파이썬은 인증서가 없어 https 를 못 여는 일이 있다. 그때는 curl 로 받는다.
        curl = shutil.which("curl")
        if not curl or subprocess.run([curl, "-fsSL", "-A", "voiceface/1.0", "-o", str(tmp), url]).returncode != 0:
            tmp.unlink(missing_ok=True)
            return False
    tmp.replace(dest)
    return True


def main() -> None:
    failed = []
    todo = [MODEL, SAMPLE]
    faces = WEB / "faces" / "faces.json"
    if faces.exists():
        for f in json.loads(faces.read_text(encoding="utf-8")):
            if f.get("video"):
                todo.append((f"{VIDEOS}/{f['video']}", f"faces/{f['video']}"))
    for url, rel in todo:
        dest = WEB / rel
        if dest.exists() and dest.stat().st_size > 0:
            continue
        print(f"받는 중: web/{rel}")
        if not get(url, dest):
            failed.append(rel)
    if (WEB / SAMPLE[1]).exists():
        (WEB / "sample" / "credits.md").write_text(CREDIT, encoding="utf-8")
    if failed:
        print("받지 못한 파일이 있습니다. 인터넷 연결을 확인하고 다시 실행하세요:")
        for rel in failed:
            print(f"  web/{rel}")
        sys.exit(1)
    print("끝. 이제 인터넷 없이도 열립니다.")


if __name__ == "__main__":
    main()
