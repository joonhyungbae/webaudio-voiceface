#!/usr/bin/env bash
#
# 한 줄로 깔기 (맥 · 리눅스)
#
#   curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webaudio-voiceface/main/install.sh | bash
#
# 하는 일: 저장소 받기 → conda 확인(없으면 Miniforge 를 깐다) → conda 환경 만들기
#          → 시험용 녹음 받기 → 켜는 법 알려 주기.
# 이미 받아 둔 폴더 안에서 실행해도 된다.
set -euo pipefail

REPO="https://github.com/joonhyungbae/webaudio-voiceface"
NAME="webaudio-voiceface"

say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
oops() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. 저장소 ────────────────────────────────────────────────────────────
if [ -f "serve.py" ] && [ -d "web" ]; then
  DIR="$(pwd)"
  say "이미 받아 둔 폴더에서 실행합니다: $DIR"
else
  DIR="$(pwd)/$NAME"
  if [ -d "$DIR/.git" ] && command -v git >/dev/null 2>&1; then
    say "폴더가 이미 있어 최신으로 받습니다: $DIR"
    git -C "$DIR" pull --ff-only >/dev/null 2>&1 || say "최신으로 받지 못했습니다. 있는 그대로 씁니다."
  elif [ -d "$DIR" ]; then
    say "폴더가 이미 있어 그대로 씁니다: $DIR"
  elif command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1; then
    say "받는 중: $DIR"
    git clone -q "$REPO" "$DIR"
  else
    # git 이 없으면 압축 파일로 받는다. 맥에서 개발 도구 설치 창이 뜨는 것을 피한다.
    say "받는 중 (압축 파일): $DIR"
    mkdir -p "$DIR"
    curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" | tar xz -C "$DIR" --strip-components 1
  fi
fi
cd "$DIR"
# shellcheck source=scripts/conda.sh
source scripts/conda.sh

# ── 2. conda ─────────────────────────────────────────────────────────────
# 언제나 conda 환경으로 돌린다. conda 가 없으면 Miniforge 를 사용자 폴더에 깐다.
if CONDA="$(find_conda)"; then
  say "conda 를 씁니다: $CONDA"
else
  say "conda 가 없어 Miniforge 를 깝니다 (~/miniforge3, 몇 분 걸립니다)"
  CONDA="$(install_miniforge)" || oops "Miniforge 를 깔지 못했습니다. https://conda-forge.org/download/ 에서 받아 깐 뒤 이 명령을 다시 실행하세요."
fi

# ── 3. 환경 ──────────────────────────────────────────────────────────────
if env_exists "$CONDA"; then
  say "이미 있는 환경을 최신으로 맞춥니다: $ENV_NAME"
  "$CONDA" env update -q -n "$ENV_NAME" -f environment.yml --prune >/dev/null
else
  say "conda 환경을 만듭니다: $ENV_NAME"
  "$CONDA" env create -q -f environment.yml >/dev/null
fi

# ── 4. 시험용 녹음. 없어도 마이크로는 돌아가므로 실패해도 멈추지 않는다 ──
say "마이크 없이 시험할 녹음을 받습니다 (약 1MB)"
"$CONDA" run --no-capture-output -n "$ENV_NAME" python fetch_sample.py \
  || say "받지 못했습니다. 마이크로 쓰는 데는 지장이 없습니다. 나중에 ./start.sh --sim 이 다시 받아 봅니다."

chmod +x start.sh start.command 2>/dev/null || true

echo
say "다 됐습니다. 이렇게 켭니다."
echo
echo "    cd \"$DIR\""
echo "    ./start.sh"
echo
echo "  브라우저가 127.0.0.1:7000 으로 열립니다. 끌 때는 Ctrl+C 입니다."
echo "  맥에서는 폴더의 start.command 를 더블클릭해도 됩니다."
echo "  ./start.sh 없이 직접 켜려면:  \"$CONDA\" run -n $ENV_NAME python serve.py"
