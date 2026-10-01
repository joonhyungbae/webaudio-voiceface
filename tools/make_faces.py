#!/usr/bin/env python3
"""
얼굴 은행에 넣을 사진을 APIFrame 으로 만든다. 예제의 web/faces/ 그림들이 이 스크립트로 만든 것이다.

전시에는 필요 없는 도구다. 한 번 돌려 그림을 만들어 두면 그 뒤로는 인터넷 없이 돈다.
수업에서 쓴 APIFrame 키를 그대로 쓴다. 키는 아래 순서로 찾고, 화면에 찍지 않는다.
  1. 환경 변수 APIFRAME_KEY
  2. ~/.opencircuit/apiframe-key  (opencircuit 설치가 만들어 둔 파일)

  python tools/make_faces.py            → faces-src/01.jpg …  (10장, 약 40크레딧). 영상의 첫 프레임이 된다
  python tools/make_faces.py --only 3   → 3번 얼굴만 다시 만든다

모델은 FLUX.2 Pro (세로 3:4, 1MP, 장당 4크레딧 안팎). 결과물은 자유롭게 쓸 수 있다.
다른 도구로 만든 얼굴이나 직접 찍은 사진을 넣어도 된다. 지킬 것은 web/faces/README.md 에 있다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web" / "faces"
# 사진은 말하는 영상을 만들 때 첫 프레임으로만 쓴다. 작품은 영상만 쓰므로 사진은 따로 둔다
PHOTOS = Path(__file__).resolve().parent.parent / "faces-src"
BASE = "https://api.apiframe.ai/v2"
MODEL = "flux-2-pro"

# 은행의 순서가 곧 rule.js 의 「앞쪽 얼굴 → 뒤쪽 얼굴」이다. 낮은 목소리 쪽에서 높은 목소리 쪽으로 늘어놓는다.
PEOPLE = [
    "a Korean man in his 60s with short gray hair",
    "a Korean man in his 40s with short black hair",
    "a Korean man in his 20s with medium-length black hair",
    "a Korean man in his 30s with a buzz cut",
    "a Korean woman in her 70s with short permed gray hair",
    "a Korean woman in her 50s with shoulder-length black hair",
    "a Korean woman in her 40s with hair tied back",
    "a Korean woman in her 30s with long straight black hair",
    "a Korean woman in her 20s with a bob haircut",
    "a Korean teenage girl with long black hair",
]

PROMPT = (
    "Realistic color photograph, studio portrait of {who}. Head and shoulders, the face centered and level, "
    "looking straight into the lens, neutral relaxed expression, lips gently closed, both eyes open. "
    "Plain light gray seamless background. Soft even frontal lighting, no harsh shadows on the face. "
    "Simple dark crew-neck top. Natural skin texture, sharp focus, 85mm lens, passport-style framing with some space above the head."
)


def key() -> str:
    k = os.environ.get("APIFRAME_KEY", "").strip()
    if not k:
        f = Path.home() / ".opencircuit" / "apiframe-key"
        if f.exists():
            k = f.read_text(encoding="utf-8").strip()
    if not k:
        sys.exit("APIFrame 키가 없습니다. 환경 변수 APIFRAME_KEY 나 ~/.opencircuit/apiframe-key 에 넣어 주세요.")
    return k


def call(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"X-API-Key": key(), "Content-Type": "application/json", "User-Agent": "voiceface/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"APIFrame 이 {e.code} 로 답했습니다: {e.read()[:200].decode(errors='replace')}")


def make(i: int, who: str) -> None:
    job = call("POST", "/images/generate", {
        "prompt": PROMPT.format(who=who),
        "model": MODEL,
        "fluxParams": {"aspect_ratio": "3:4", "resolution": "1MP", "output_format": "jpg", "output_quality": 92, "seed": 1000 + i},
    })
    jid = job.get("jobId") or job.get("id")
    for _ in range(90):
        time.sleep(2)
        j = call("GET", f"/jobs/{jid}")
        if j.get("status") == "COMPLETED":
            url = (j.get("result") or {}).get("images", [None])[0]
            name = f"{i:02d}.jpg"
            urllib.request.urlretrieve(url, PHOTOS / name)
            print(f"{name}  {who}")
            return
        if j.get("status") == "FAILED":
            sys.exit(f"{i}번을 만들지 못했습니다: {j.get('error')}")
    sys.exit(f"{i}번이 3분 안에 끝나지 않았습니다. 잠시 뒤 --only {i} 로 다시 해 보세요.")


def main() -> None:
    ap = argparse.ArgumentParser(description="얼굴 은행 사진 만들기 (APIFrame)")
    ap.add_argument("--only", type=int, help="이 번호만 다시 만든다")
    args = ap.parse_args()
    PHOTOS.mkdir(parents=True, exist_ok=True)
    for i, who in enumerate(PEOPLE, 1):
        if args.only and i != args.only:
            continue
        make(i, who)
    print(f"faces-src/ 에 만들었습니다. 이 사진들을 인터넷에서 열리는 곳에 올리고 tools/make_videos.py --base 주소 로 영상을 만듭니다.")


if __name__ == "__main__":
    main()
