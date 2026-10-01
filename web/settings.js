/*
 만지는 숫자는 전부 여기 있다.

 조작 화면의 조절판(PARAMS)은 여기 적힌 값이 처음 값이다. 조절판에서 바꾼 값은 그 브라우저에
 남는다. 이 파일의 처음 값을 고치면 남아 있던 값은 버리고 고친 값으로 다시 시작한다.

 목소리의 무엇이 얼굴의 무엇을 바꾸는지(작품의 규칙)는 rule.js 에, 읽을 문장은 script.js 에 있다.
*/

// ─── 조절판 ──────────────────────────────────────────────────────────────
export const PARAMS = [
  // 말소리로 볼 가장 낮은 크기. 실제 문턱은 방의 바닥 소음을 따라 이보다 올라간다
  { key: "voiceThreshold", label: "말소리 문턱", min: 0.05, max: 0.6, step: 0.01, value: 0.22 },
  // 말이 끝나고 이만큼 조용하면 다음 줄로 넘어간다
  { key: "lineSilence", label: "줄 넘김 침묵(초)", min: 0.6, max: 4, step: 0.1, value: 1.6 },
  // 이만큼 말하면 얼굴이 다 맞춰진다. 짧으면 금방 또렷해지고, 길면 끝까지 흔들린다
  { key: "formSeconds", label: "얼굴이 맞춰지는 시간(초)", min: 3, max: 60, step: 1, value: 15 },
  // 높낮이에 따라 고개가 기우는 정도
  { key: "tiltGain", label: "고개 기울기 세기", min: 0, max: 2, step: 0.05, value: 1 },
  // 얼굴이 조각으로 흩어지는 시간
  { key: "disperseSeconds", label: "흩어지는 시간(초)", min: 3, max: 30, step: 1, value: 10 },
  // 다시 듣기를 할지. 끄면 낭독이 끝나자마자 흩어진다
  { key: "replay", label: "다시 듣기", type: "check", value: true },
  // 자막을 보일지
  { key: "captions", label: "자막", type: "check", value: true },
  { key: "ink", label: "선", type: "color", value: "#1a1917" },
  { key: "paper", label: "바탕", type: "color", value: "#efede6" },
];

// ─── 목소리 읽기 (voice.js) ──────────────────────────────────────────────
export const LEVEL_FLOOR_DB = -60;    // 이보다 작은 소리는 0 으로 본다
export const LEVEL_RANGE_DB = 45;     // 바닥에서 이만큼 크면 1 로 본다
export const PITCH_LOW_HZ = 80;       // 높낮이 0 에 해당하는 음
export const PITCH_HIGH_HZ = 350;     // 높낮이 1 에 해당하는 음
export const SYLLABLES_PER_SEC = 7;   // 빠르기 1 에 해당하는 음절 수
export const PAUSE_MIN_SEC = 0.25;    // 이보다 긴 침묵을 「멈춤」 하나로 센다
export const PITCH_SPREAD_ST = 5;     // 높낮이 변화 1 에 해당하는 반음 폭
export const LINE_READ_RATIO = 0.7;   // 한 줄의 글자 수에서 이만큼 음절을 읽고
export const LINE_READ_PAUSE = 0.35;  // 이만큼 쉬면 다음 줄로 넘긴다 (한국어는 글자 하나가 음절 하나)
export const NOISE_MARGIN = 0.15;     // 바닥 소음보다 이만큼 커야 말소리로 본다
export const FLOOR_RISE = 0.04;       // 바닥 소음 짐작이 초당 오르는 폭. 내려갈 때는 바로 따라간다

// ─── 얼굴 (face.js · morph.js) ───────────────────────────────────────────
export const OUT_W = 768;             // 얼굴 그림 한 장의 크기(세로 3:4)
export const OUT_H = 1024;
export const EYE_LINE = 0.38;         // 두 눈을 맞출 높이 (위에서부터의 비율)
export const EYE_GAP = 0.26;          // 두 눈 사이 거리 (너비에 대한 비율). 크면 얼굴이 크게 나온다
export const REGION_NEAR = 0.014;     // 부위(눈·코·입) 점에서 이만큼 안쪽은 그 부위의 얼굴을 온전히 쓴다
export const REGION_FAR = 0.09;       // 이만큼 멀어지면 윤곽 얼굴로 다 넘어간다. 넓으면 더 부드럽게 섞인다
export const COLOR_MATCH = 0.9;       // 넓은 색(밝기·혈색)을 윤곽 얼굴에서 가져오는 정도. 세부(주름·눈매)는 부위 얼굴 그대로다
export const COLOR_BLUR = 64;         // 「넓은 색」을 재는 해상도(너비 픽셀). 피부만 골라 흐리게 평균낸다
export const CONTOUR_SNAP = 1;        // 윤곽(머리카락·옷·배경)을 섞는 정도. 1 이면 가까운 얼굴 하나를 고르고, 0 이면 고르게 섞는다.
                                      // 머리카락과 옷은 그물망이 덜 맞아 반반 섞이면 겹쳐 보인다. 은행 사진이 서로 비슷하면 낮춰도 된다
export const BLINK_EVERY = 4.5;       // 눈을 깜빡이는 대략의 간격(초)
export const TILE_COLS = 14;          // 흩어질 때 조각 수
export const TILE_ROWS = 20;

// ─── 말하는 영상 (talk.js) ───────────────────────────────────────────────
export const TALK_FPS = 24;           // 다시 듣기 때 영상 프레임을 바꾸는 횟수(초당). 영상의 프레임 수와 맞춘다
export const TALK_CROP_W = 360;       // 영상에서 아래 얼굴을 잘라 둘 너비(픽셀). 크면 또렷하고 메모리를 더 쓴다
export const TALK_JUMP = 0.6;         // 영상의 다른 자리로 건너뛰는 값. 크면 덜 튀고, 작으면 입 모양을 더 정확히 따른다
export const TALK_HOLD = 0.15;        // 같은 프레임에 머무는 값

// ─── 입 모양 (lipsync.js) ────────────────────────────────────────────────
export const LIPSYNC_FPS = 100;       // 입 모양을 뽑는 횟수(초당)
export const LIPSYNC_LEAD = 0.04;     // 입이 소리보다 먼저 움직이는 시간(초)
export const LIPSYNC_SMOOTH = 0.03;   // 앞뒤로 부드럽게 잇는 폭(초)

// ─── 전시 화면으로 보내기 ────────────────────────────────────────────────
export const SEND_HZ = 30;            // 조작 화면이 전시 화면에 상태를 보내는 횟수(초당)
