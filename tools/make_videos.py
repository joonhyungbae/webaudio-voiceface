#!/usr/bin/env python3
"""
얼굴 은행의 사진마다 「말하는 영상」을 APIFrame 으로 만든다. 다시 듣기 때 입 부분을 이 영상에서 가져온다.

사진(web/faces/NN.jpg)을 첫 프레임으로 넣고, 그 사람이 카메라를 보고 말하는 몇 초짜리 영상을 받는다.
입이 여러 모양으로 열리고 닫혀야 다시 듣기 때 고를 프레임이 많아진다.

  python tools/make_videos.py              → web/faces/NN.mp4 (전부)
  python tools/make_videos.py --only 6     → 6번만
  python tools/make_videos.py --model kling-3.0

APIFrame 은 사진을 주소로 받는다. 사진이 공개 저장소에 올라가 있으면 그 주소를 쓴다(--base 로 바꿀 수 있다).
키는 make_faces.py 와 같다: 환경 변수 APIFRAME_KEY 나 ~/.opencircuit/apiframe-key 에서 읽기만 한다.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_faces import OUT, call  # noqa: E402  같은 키·같은 호출 방식을 쓴다

BASE = "https://raw.githubusercontent.com/joonhyungbae/webaudio-voiceface/main/web/faces"

PROMPT = (
    "The person looks straight into the camera and talks continuously, as if reading a short text aloud. "
    "The mouth opens and closes naturally with clearly varied shapes: wide open vowels, rounded lips, spread lips, "
    "and brief pauses with the lips gently closed. The head stays still and centered, only very slight natural movement. "
    "Eyes blink naturally. No hand gestures, no smiling, neutral expression. Static camera, same framing, "
    "same plain light gray background and soft even lighting as the photo."
)

MODELS = {
    # 모델마다 매개변수 이름이 다르다
    "hailuo-02": lambda img: {"hailuoParams": {"image": img, "duration": 10, "resolution": "768p"}},
    "kling-3.0": lambda img: {"klingParams": {"start_image": img, "duration": 10, "mode": "standard", "generate_audio": False}},
}


def make(i: int, model: str, base: str) -> None:
    img = f"{base}/{i:02d}.jpg"
    job = call("POST", "/videos/generate", {"prompt": PROMPT, "model": model, **MODELS[model](img)})
    jid = job.get("jobId") or job.get("id")
    print(f"{i:02d} 맡겼습니다 ({model})")
    for _ in range(300):
        time.sleep(4)
        j = call("GET", f"/jobs/{jid}")
        if j.get("status") == "COMPLETED":
            r = j.get("result") or {}
            url = r.get("videoUrl") or (r.get("videos") or [None])[0]
            raw = OUT / f"{i:02d}.raw.mp4"
            urllib.request.urlretrieve(url, raw)
            seekable(raw, OUT / f"{i:02d}.mp4")
            print(f"{i:02d}.mp4 받았습니다")
            return
        if j.get("status") == "FAILED":
            sys.exit(f"{i}번을 만들지 못했습니다: {j.get('error')}")
    sys.exit(f"{i}번이 20분 안에 끝나지 않았습니다.")


def seekable(src: Path, dst: Path) -> None:
    """키프레임을 4프레임마다 넣어 다시 인코딩한다. 생성 모델의 영상은 키프레임이 처음에 하나뿐이라,
    브라우저가 한 시점으로 넘어갈 때마다 처음부터 다시 풀어 갈수록 느려진다. 소리도 뺀다."""
    ff = shutil.which("ffmpeg")
    if not ff:
        src.replace(dst)
        print("  ffmpeg 가 없어 그대로 둡니다. 준비가 느릴 수 있습니다 (conda 환경에는 ffmpeg 가 들어 있습니다)")
        return
    subprocess.run([ff, "-v", "error", "-y", "-i", str(src), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22",
                    "-g", "4", "-bf", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], check=True)
    src.unlink()


def main() -> None:
    ap = argparse.ArgumentParser(description="말하는 영상 만들기 (APIFrame)")
    ap.add_argument("--only", type=int)
    ap.add_argument("--model", default="hailuo-02", choices=list(MODELS))
    ap.add_argument("--base", default=BASE, help="사진을 받을 수 있는 공개 주소의 폴더")
    args = ap.parse_args()
    faces = json.loads((OUT / "faces.json").read_text(encoding="utf-8"))
    for n, f in enumerate(faces, 1):
        if args.only and n != args.only:
            continue
        make(n, args.model, args.base)


if __name__ == "__main__":
    main()
