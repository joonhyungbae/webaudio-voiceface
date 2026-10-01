#!/usr/bin/env bash
#
# 켜기 (맥 · 리눅스)
#
#   ./start.sh                 마이크로 켠다. 브라우저에 조작 화면이 열린다
#   ./start.sh --sim           마이크 대신 시험용 녹음으로
#   ./start.sh --auto          체험을 끝없이 되풀이한다 (--sim 과 함께 쓰면 시연용)
#   ./start.sh --offline 30    장비 없이 시험용 녹음으로 한 바퀴 돌며 30초를 out.mp4 로 적는다
#   ./start.sh --host 0.0.0.0  폰이나 다른 컴퓨터에서 본다
#   ./start.sh --port 7001     포트를 바꾼다
#
# conda 환경(voiceface)으로 켠다. conda 를 터미널 설정 없이도 찾는다.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/conda.sh
source scripts/conda.sh

CONDA="$(find_conda)" || { echo "conda 가 없습니다. 먼저 설치해 주세요:  bash install.sh" >&2; exit 1; }
env_exists "$CONDA" || { echo "conda 환경($ENV_NAME)이 없습니다. 먼저 설치해 주세요:  bash install.sh" >&2; exit 1; }
py() { "$CONDA" run --no-capture-output -n "$ENV_NAME" python "$@"; }

# 시험용 녹음이 필요한데 없으면 한 번 받아 본다
case " $* " in
  *" --sim "*|*" --offline "*) [ -f "web/sample/목소리.flac" ] || py fetch_sample.py || true ;;
esac

py serve.py "$@"
