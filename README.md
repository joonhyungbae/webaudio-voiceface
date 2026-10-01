# webaudio-voiceface

**관객이 화면의 문장을 소리 내어 읽으면 그 목소리로 얼굴 하나가 조합됩니다.** 읽는 빠르기, 크기,
높낮이, 멈춤에 따라 눈·코·입·윤곽을 서로 다른 사진 얼굴에서 가져와 한 장의 사진처럼 섞고, 읽을수록
어긋나 있던 얼굴이 맞춰집니다. 다 읽으면 그 얼굴이 관객의 녹음에 맞춰 입을 움직이며 다시 말한 뒤
조각으로 흩어지고, 녹음은 지워집니다.

맥북 한 대, 마이크, 세로로 세운 모니터로 돕니다. 얼굴마다 MediaPipe 가 랜드마크 478점을 찾고,
WebGL 이 그 그물망 위에서 얼굴들의 모양과 피부를 점마다 다른 비율로 섞습니다. 입은 얼굴마다 미리 만들어 둔
「말하는 영상」에서 가져옵니다. 녹음의 입 모양에 맞는 프레임을 골라 이어 붙이므로 입술과 이가 진짜로 움직입니다. 인터넷 없이 돌고,
목소리는 컴퓨터 밖으로 나가지 않습니다. 완성된 작품이 아니라 출발점이고, 바꿔 가며 자기 작품으로
만들라고 둔 예제입니다. 설치 없이 보려면 <https://joonhyungbae.github.io/webaudio-voiceface/> 를
크롬으로 엽니다.

《2026 오픈서킷 부산: 아트앤테크 프랙티스》 멘토링 과정에서 만든 예제입니다. 참여 작가와
작업을 구상하다 공통으로 쓸 만한 뼈대가 나와, 참여자 누구나 쓸 수 있도록 공개합니다.

## 1. 깔기

터미널을 엽니다. 윈도우는 시작 메뉴에서 `PowerShell`, 맥은 `터미널`입니다.

**맥 · 리눅스**

```bash
curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webaudio-voiceface/main/install.sh | bash
```

**윈도우 (PowerShell)**

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/joonhyungbae/webaudio-voiceface/main/install.ps1 -OutFile "$env:TEMP\install.ps1"
& "$env:TEMP\install.ps1"
```

설치가 챙기는 것: conda 환경(`voiceface`), 얼굴 랜드마크 모델(약 4MB), 얼굴마다의 말하는 영상(10편, 약 40MB),
마이크 없이 시험할 녹음(약 1MB).
conda 가 없으면 [Miniforge](https://conda-forge.org/download/)를 사용자 폴더(`~/miniforge3`)에 먼저 깝니다.
관리자 권한이 필요 없고 터미널 설정 파일은 건드리지 않습니다. 이미 conda 가 있으면 그것을 씁니다.

## 2. 켜기

```bash
./start.sh          # 맥 · 리눅스
.\start.ps1         # 윈도우
```

맥에서는 폴더의 `start.command` 를 더블클릭해도 됩니다. 처음에 「확인되지 않은 개발자」라고
막히면 오른쪽 클릭 → **열기** 입니다.

브라우저에 조작 화면이 저절로 열립니다. 안 열리면 `127.0.0.1:7000` 을 칩니다. 마이크 권한을 묻으면
**허용** 합니다. 끌 때는 <kbd>Ctrl</kbd>+<kbd>C</kbd>.

이 한 줄이 conda 환경을 찾아 그 안에서 켭니다. 7000 번이 쓰이고 있으면 다음 빈 번호를 찾습니다.

**외부 모니터에 띄우기.** 조작 화면 오른쪽 아래 **전시 화면 열기** 를 누르면 창이 하나 더 뜹니다.
그 창을 세로 모니터로 옮기고 클릭하면 전체 화면이 됩니다. 조작 화면은 노트북에 둡니다.

| 명령 | 하는 일 |
|---|---|
| `./start.sh --sim` | 마이크 대신 시험용 녹음을 관객의 목소리로 쓴다 |
| `./start.sh --sim --auto` | 체험을 끝없이 되풀이한다. 마이크 없는 시연용 |
| `./start.sh --offline 30` | 장비 없이 한 바퀴 돌며 30초를 `out.mp4` 로 적는다 (화면과 소리) |
| `./start.sh --host 0.0.0.0` | 폰이나 다른 컴퓨터에서 본다 (마이크는 켠 컴퓨터에서만 열린다) |
| `./start.sh --port 7001` | 포트를 바꾼다 |

## 3. 화면에서 보는 것

**조작 화면** (노트북)

- **미리보기**: 전시 화면에 나가는 그림과 같습니다.
- **단계**: 기다림 → 안내 → 낭독 → 말할 준비(몇 초) → 다시 듣기 → 흩어짐 → 지움. 버튼으로 넘깁니다.
  - **직접 읽기 시작**: 마이크로 읽습니다. 그 줄을 거의 다 읽고 잠깐 쉬면 다음 줄로 넘어갑니다.
  - **합성 음성으로**: 운영체제의 음성 합성이 대신 읽습니다. 직접 읽기 어려운 관객을 위한 길입니다.
  - **보기만 하기**: 시험용 녹음으로 한 바퀴 돕니다. 관객의 목소리는 쓰지 않습니다.
  - **처음으로**: 어느 단계에서든 녹음을 지우고 처음으로 돌아갑니다.
- **목소리**: 마이크를 고르고 소리 크기를 봅니다. 초록이면 말소리로 본 것이고, 흰 눈금이 그 문턱입니다.
- **낭독에서 모은 숫자**: 크기, 높낮이, 높낮이 변화, 빠르기, 멈춤, 고른 리듬. 그 아래는 규칙을 거쳐
  나온 얼굴 번호와 입 벌림, 맞춰진 정도입니다.
- **조절**: 슬라이더를 움직이면 바로 달라집니다.

<kbd>Space</kbd> 시작·다음 줄, <kbd>Esc</kbd> 처음으로(녹음 지움), <kbd>H</kbd> 조절판 숨기기.

**전시 화면** (세로 모니터): 얼굴과 자막만 보입니다. 조작 화면이 꺼지면 기다림 장면으로 돌아갑니다.

## 4. 바꾸는 자리

1. **`web/settings.js`** 숫자가 전부 이 파일에 있습니다. 조절판의 처음 값, 높낮이 범위, 줄을 넘기는
   기준, 얼굴을 자르는 띠의 위치가 여기 있습니다. 고치고 저장한 뒤 브라우저를 새로 고침합니다.
2. **조절판 슬라이더** 「얼굴이 맞춰지는 시간」을 길게 하면 끝까지 어긋난 얼굴로 남고, 짧게 하면 금방
   또렷해집니다. 「다시 듣기」를 끄면 다 읽자마자 흩어집니다.
3. **`web/script.js`** 안내 글, 관객이 읽을 문장, 마지막 문장입니다. 지금은 자리를 채우려고 윤동주의
   「서시」를 넣어 두었습니다.
4. **`web/faces/`** 얼굴 은행입니다. 지금은 예제로 만든 사진 10장이 들어 있습니다. 작가의 얼굴로 바꾸는 법은
   [web/faces/README.md](web/faces/README.md). 정면, 다문 입, 고른 조명이면 크기와 위치는 달라도 됩니다.
5. **`web/rule.js`** 목소리의 무엇이 얼굴의 무엇을 바꾸는지 정하는 곳입니다. 「낮은 목소리면 앞쪽 얼굴의
   윤곽」, 「빨리 읽으면 뒤쪽 얼굴의 눈」 같은 연결이 한 줄씩 적혀 있습니다. 이 줄들을 바꾸면 작품이 바뀝니다.

Cursor 에서 이 폴더를 열고 「rule.js 에서 멈춤이 많을수록 얼굴이 덜 맞춰지게 바꿔 줘」처럼 말하면 됩니다.

## 5. 안 될 때

| 이런 일이 생기면 | 이렇게 합니다 |
|---|---|
| 마이크가 안 켜진다 | 주소창 왼쪽 자물쇠를 눌러 마이크를 허용합니다. 맥은 시스템 설정 → 개인정보 보호 → 마이크에서 크롬을 켭니다 |
| 말해도 초록이 안 된다 | 조절판의 「말소리 문턱」을 내립니다. 마이크를 입에 더 가까이 둡니다 |
| 조용한데도 초록이다 | 「말소리 문턱」을 올립니다. 방의 바닥 소음은 저절로 따라가지만 소음이 아주 크면 모자랍니다 |
| 줄이 안 넘어간다 | 줄 끝에서 조금 더 쉬거나 <kbd>Space</kbd> 를 누릅니다. 「줄 넘김 침묵」을 줄여도 됩니다 |
| 전시 화면이 따라오지 않는다 | 두 창이 같은 브라우저(같은 크롬)에서 열렸는지 봅니다. 전시 화면은 조작 화면의 버튼으로 엽니다 |
| 합성 음성이 소리를 안 낸다 | 운영체제에 한국어 음성이 깔려 있는지 봅니다. 맥은 시스템 설정 → 손쉬운 사용 → 읽기 및 말하기 |
| 고쳤더니 화면이 하얗게 멈췄다 | 코드에 오타가 있습니다. 크롬에서 <kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>J</kbd>(윈도우는 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>)로 빨간 글자를 보고, 그대로 Cursor 에 붙여 넣습니다 |
| 「얼굴을 읽지 못했습니다」가 나온다 | `web/faces/faces.json` 의 파일 이름이 맞는지 봅니다. 얼굴을 못 찾은 그림은 상태 줄에 이름이 나옵니다. 정면 사진으로 바꿉니다 |
| 섞인 얼굴의 피부색이 얼룩진다 | 은행의 사진들 조명이 서로 많이 다릅니다. 비슷한 조명으로 맞추거나 `settings.js` 의 `COLOR_MATCH` 를 올립니다 |
| 「conda 환경이 없습니다」가 나온다 | 설치 한 줄을 다시 실행합니다. 받아 둔 폴더 안에서 `bash install.sh` 로 쳐도 됩니다 |

## 6. 더 들어가기

```text
serve.py          시작하는 자리. web/ 를 띄우고 --sim · --auto · --offline 을 처리한다
fetch_assets.py   얼굴 랜드마크 모델과 시험용 녹음을 받는다
tools/make_faces.py  예제 얼굴 사진을 만든 스크립트 (APIFrame, 전시에는 필요 없다)
tools/make_videos.py 얼굴마다 말하는 영상을 만든 스크립트 (APIFrame, 전시에는 필요 없다)
web/
├── settings.js   만지는 숫자가 전부 여기. 여기부터 본다
├── script.js     화면에 나오는 글과 읽을 문장
├── voice.js      입력. 마이크 · 녹음 · 합성 음성을 숫자로 바꾼다
├── tap.js        오디오 스레드에서 소리를 받아 voice.js 에 넘긴다
├── rule.js       숫자를 얼굴 조합으로 잇는다. 여기가 작품이다
├── face.js       출력. 얼굴 은행 읽기, 장면, 흩어짐, 자막
├── morph.js      얼굴 엔진. 랜드마크 그물망으로 섞고 입·턱·눈꺼풀을 움직인다 (WebGL2)
├── lipsync.js    녹음 전체에서 입 모양(턱 벌림·입술 모음·벌림)을 뽑는다
├── talk.js       말하는 영상에서 녹음에 맞는 프레임 순서를 정해 입을 가져온다
├── regions.js    MediaPipe 얼굴 메시의 부위별 점 번호
├── session.js    체험 한 번의 순서와 장면 그리기
├── app.js        조작 화면
├── display.js    전시 화면. 조작 화면이 보낸 숫자만 받아 그린다
├── faces/        얼굴 은행 (사진과 faces.json)
└── vendor/       MediaPipe 라이브러리 (인터넷 없이 돌도록 넣어 두었다)
```

얼굴은 이렇게 섞입니다. 사진마다 두 눈을 같은 자리에 맞추고, 모든 얼굴의 평균 모양으로 삼각형 그물망을
만듭니다. 그물망의 점마다 눈·코·입·윤곽 중 어디에 얼마나 속하는지를 매끄럽게 정해 두고, 부위마다 고른
얼굴의 비율을 곱해 점마다 얼굴별 비율을 냅니다. 모양은 그 비율로 섞은 점 자리이고, 사진은 얼굴마다 그
모양으로 휘어 비율만큼 더합니다. 피부색은 윤곽을 준 얼굴 쪽으로 맞춥니다. 그래서 이음새가 없습니다.

말하는 입은 이렇게 만듭니다. 먼저 녹음의 울림(포먼트)으로 프레임마다 입이 얼마나 벌어졌을지 짐작합니다.
말의 뜻은 보지 않아 어느 언어든 같습니다. 관객을 기다리는 동안 얼굴마다의 말하는 영상을 훑어 프레임마다 입 모양을
재 두고, 낭독이 끝나면 녹음 전체에 대해 「입 모양이 맞으면서 프레임이 매끄럽게 이어지는」 순서를 한 번에 풉니다
(비터비). 다시 듣기 동안 그 순서대로 입 부위를 영상 프레임으로 바꿔 끼우고, 턱도 영상의 움직임을 따라갑니다.
영상이 없는 얼굴이면 사진의 입을 그물망으로 움직여 대신합니다.

목소리는 오디오 스레드(AudioWorklet)에서 1024 샘플씩 받아 잽니다. 크기는 RMS, 높낮이는 YIN 방식,
빠르기는 소리 크기의 봉우리(음절) 수, 멈춤은 0.25초가 넘는 침묵입니다. 말소리의 문턱은 방의 바닥
소음을 따라 저절로 올라갑니다. 조작 창이 다른 창에 가려져도 분석은 멈추지 않습니다.

녹음은 이 브라우저의 메모리에만 있습니다. 파일로 저장하지 않고, 서버로도 보내지 않으며, 흩어짐이
끝나거나 「처음으로」를 누르면 버립니다. 전시 화면에는 목소리가 아니라 숫자만 갑니다.

왜 이런 구조인지는 [docs/notes.md](docs/notes.md). AI 도구로 고칠 때의 규칙은 [AGENTS.md](AGENTS.md).

## 쓰는 것과 라이선스

얼굴 랜드마크는 [MediaPipe](https://ai.google.dev/edge/mediapipe)(Apache-2.0)입니다. 라이브러리는
`web/vendor/` 에 넣어 두었고, 모델은 설치할 때 받습니다. 예제 얼굴 사진은 APIFrame 의 FLUX.2 Pro 로 만든
가상 인물이고 실존 인물이 아닙니다. 시험용 녹음은 위키미디어 공용의 CC0 녹음입니다. 전체 목록은 [NOTICE.md](NOTICE.md).

코드는 [OpenCircuit License v1.0](LICENSE)을 따릅니다. 오픈소스가 아니라 소스를 공개하되
쓰임을 제한합니다.

- **됩니다**: 받아서 쓰고 고치기. 이것으로 만든 **작품**은 전시하고 팔아도 허가가 필요 없습니다.
- **문의해 주세요**: 강좌나 워크숍의 교재로 쓰는 것, 코드 자체를 파는 것. <jh.bae@kaist.ac.kr>

---

<details>
<summary>English</summary>

A visitor reads lines aloud and a face is assembled from their voice. Speaking rate, loudness, pitch and
pauses pick the eyes, nose, mouth and contour from different faces in a bank; the face settles as more is
read. At the end the face speaks with the visitor's recording, breaks into fragments, and the recording is
discarded.

```bash
curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webaudio-voiceface/main/install.sh | bash
cd webaudio-voiceface && ./start.sh      # operator page at 127.0.0.1:7000
```

Everything runs in the browser: an AudioWorklet feeds RMS level, YIN pitch, syllable peaks and pauses to
`web/voice.js`; `web/rule.js` maps them to a per-region face selection; `web/morph.js` blends photographs on
a MediaPipe 478-landmark Delaunay mesh in WebGL2 with spatially varying weights and skin-tone matching, and
animates jaw, lips and eyelids from an LPC-formant lip-sync track computed over the whole recording
(`web/lipsync.js`). A second window (`display.html`) receives only numbers over BroadcastChannel for the portrait
monitor. The installer creates a conda environment (`voiceface`, Python only, used for the local server).
Every tunable value is in `web/settings.js`.

Source-available, not open source: personal and artistic use is free and the works you make are
entirely yours; teaching with it or selling it needs permission ([LICENSE](LICENSE)).

</details>

<sub>《2026 오픈서킷 부산: 아트앤테크 프랙티스》에서 만든 작품 베이스라인입니다. 다른 도구는
[opencircuit](https://github.com/joonhyungbae/opencircuit)에 모여 있습니다.</sub>
