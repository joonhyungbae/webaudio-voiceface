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
  // 입이 벌어지는 정도
  { key: "mouthGain", label: "입 벌림 세기", min: 0, max: 2, step: 0.05, value: 1 },
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

// ─── 얼굴 (face.js) ──────────────────────────────────────────────────────
export const FACE_COUNT = 8;          // 그려서 쓰는 얼굴 수 (web/faces/ 에 그림이 있으면 그것을 쓴다)
export const FACE_SEED = 27;          // 같은 수면 같은 얼굴들이 나온다
export const FACE_W = 600;            // 얼굴 그림 한 장의 크기
export const FACE_H = 800;
// 얼굴을 띠로 나눠 띠마다 다른 얼굴에서 가져온다. [위, 아래, 왼쪽, 오른쪽] 비율
// 가로를 얼굴 안쪽으로 좁혀 두어야 머리카락과 윤곽은 아래 얼굴 것이 그대로 남는다
export const BANDS = {
  eyes: [0.33, 0.5, 0.2, 0.8],
  nose: [0.5, 0.62, 0.36, 0.64],
  mouth: [0.62, 0.8, 0.3, 0.7],
};
export const BAND_FEATHER = 0.035;    // 띠 경계를 부드럽게 섞는 폭
export const TILE_COLS = 14;          // 흩어질 때 조각 수
export const TILE_ROWS = 20;

// ─── 전시 화면으로 보내기 ────────────────────────────────────────────────
export const SEND_HZ = 30;            // 조작 화면이 전시 화면에 상태를 보내는 횟수(초당)
