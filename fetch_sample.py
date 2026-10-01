#!/usr/bin/env python3
"""
시험용 녹음을 받는다. 마이크 없이(--sim, --offline) 돌려 보는 데 쓴다. 설치(install.sh)가 대신 해 준다.

  python3 fetch_sample.py       → web/sample/목소리.flac (약 1MB)

이미 받았으면 건너뛴다. 받은 파일은 저장소에 올라가지 않는다(.gitignore).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

WEB = Path(__file__).parent / "web"
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
    url, rel = SAMPLE
    dest = WEB / rel
    if not (dest.exists() and dest.stat().st_size > 0):
        print(f"받는 중: web/{rel}")
        if not get(url, dest):
            print("받지 못했습니다. 인터넷 연결을 확인하고 다시 실행하세요. 마이크로 쓰는 데는 지장이 없습니다.")
            sys.exit(1)
    (WEB / "sample" / "credits.md").write_text(CREDIT, encoding="utf-8")
    print("끝. 마이크 없이 돌려 보려면:  ./start.sh --sim")


if __name__ == "__main__":
    main()
