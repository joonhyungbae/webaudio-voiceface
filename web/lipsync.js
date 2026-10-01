/*
 녹음 전체를 보고 입 모양을 프레임마다 뽑는다. 다시 듣기 때 얼굴이 이 값으로 말한다.

 소리마다 입 모양이 다른 까닭은 입안의 울림(포먼트)이 달라서다. 그 거꾸로를 쓴다.
   첫째 울림(F1)이 높으면 턱이 많이 벌어진 소리다 (아)
   둘째 울림(F2)이 낮으면 입술을 모은 소리다 (우·오)
   둘째 울림이 높으면 입술을 옆으로 벌린 소리다 (이·에)
 울림은 LPC(선형 예측)로 찾는다. 말의 뜻은 보지 않아서 어느 언어든 같다.

 녹음을 다 가진 뒤에 계산하므로 앞뒤를 함께 볼 수 있다. 입은 소리보다 조금 먼저 움직이고(LEAD),
 앞뒤 프레임과 부드럽게 이어진다(SMOOTH). 40초 녹음이 1초 안에 끝난다.

 내놓는 것: { fps, open[], round[], spread[] }  값은 모두 0~1
*/

import { LIPSYNC_FPS as FPS, LIPSYNC_LEAD as LEAD, LIPSYNC_SMOOTH as SMOOTH, LEVEL_FLOOR_DB, LEVEL_RANGE_DB } from "./settings.js";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* 자기상관에서 LPC 계수를 구한다 (레빈슨-더빈). */
function lpc(frame, order) {
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = k; i < frame.length; i++) s += frame[i] * frame[i - k];
    r[k] = s;
  }
  if (r[0] <= 0) return null;
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let e = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    const prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    e *= 1 - k * k;
    if (e <= 0) return null;
  }
  return a;
}

/* LPC 덮개(스펙트럼 윤곽)에서 봉우리 둘을 F1·F2 로 고른다. */
function formants(a, sr) {
  const bins = 160, top = 3400;
  const env = new Float64Array(bins);
  for (let b = 0; b < bins; b++) {
    const w = (Math.PI * 2 * ((b + 0.5) / bins) * top) / sr;
    let re = 0, im = 0;
    for (let k = 0; k < a.length; k++) { re += a[k] * Math.cos(-w * k); im += a[k] * Math.sin(-w * k); }
    env[b] = 1 / (re * re + im * im);
  }
  const peaks = [];
  for (let b = 1; b < bins - 1; b++) if (env[b] > env[b - 1] && env[b] >= env[b + 1]) peaks.push(((b + 0.5) / bins) * top);
  const f1 = peaks.find((f) => f > 200 && f < 1100) || 500;
  const f2 = peaks.find((f) => f > f1 + 250 && f < 3000) || 1500;
  return [f1, f2];
}

export function analyze(buffer) {
  // 한 채널로 모으고, 11kHz 안팎으로 솎는다 (울림은 3.4kHz 아래에 있다)
  const src = buffer.getChannelData(0);
  const step = Math.max(1, Math.round(buffer.sampleRate / 11025));
  const sr = buffer.sampleRate / step;
  const x = new Float32Array(Math.floor(src.length / step));
  for (let i = 0; i < x.length; i++) x[i] = src[i * step];
  const hop = Math.round(sr / FPS), win = Math.round(sr * 0.03);
  const frames = Math.max(1, Math.floor((x.length - win) / hop));
  const level = new Float32Array(frames), f1s = new Float32Array(frames), f2s = new Float32Array(frames);
  const frame = new Float64Array(win);
  for (let n = 0; n < frames; n++) {
    let s = 0;
    for (let i = 0; i < win; i++) {
      const v = x[n * hop + i] - 0.95 * (x[n * hop + i - 1] || 0);  // 높은 쪽을 살린다
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
      frame[i] = v * hann;
      s += x[n * hop + i] ** 2;
    }
    const db = 10 * Math.log10(s / win + 1e-12);
    level[n] = clamp((db - LEVEL_FLOOR_DB) / LEVEL_RANGE_DB);
    const a = lpc(frame, 12);
    [f1s[n], f2s[n]] = a ? formants(a, sr) : [500, 1500];
  }
  // 바닥 소음을 빼고 말소리의 세기로 바꾼다
  const sorted = Array.from(level).sort((p, q) => p - q);
  const floor = sorted[Math.floor(sorted.length * 0.1)], peak = sorted[Math.floor(sorted.length * 0.95)];
  const open = new Float32Array(frames), round = new Float32Array(frames), spread = new Float32Array(frames);
  for (let n = 0; n < frames; n++) {
    const v = clamp((level[n] - floor - 0.04) / Math.max(0.05, peak - floor));
    const o = clamp((f1s[n] - 280) / 520);
    open[n] = Math.pow(v * (0.35 + 0.65 * o), 0.75);  // 작은 움직임도 보이게 살짝 키운다
    round[n] = v * clamp((1250 - f2s[n]) / 550);
    spread[n] = v * clamp((f2s[n] - 1750) / 650);
  }
  // 앞뒤로 부드럽게, 입이 소리보다 조금 먼저
  const lead = Math.round(LEAD * FPS);
  const out = {};
  for (const [k, arr] of Object.entries({ open, round, spread })) {
    const sm = gauss(arr, SMOOTH * FPS);
    const shifted = new Float32Array(frames);
    for (let n = 0; n < frames; n++) shifted[n] = sm[Math.min(frames - 1, n + lead)];
    out[k] = shifted;
  }
  return { fps: FPS, ...out };
}

function gauss(arr, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  const out = new Float32Array(arr.length);
  for (let n = 0; n < arr.length; n++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += arr[Math.min(arr.length - 1, Math.max(0, n + i))] * k[i + r];
    out[n] = s / sum;
  }
  return out;
}

/* 재생 중인 시각(초)의 입 모양 */
export function at(track, t) {
  if (!track) return { open: 0, round: 0, spread: 0 };
  const n = Math.min(track.open.length - 1, Math.max(0, Math.round(t * track.fps)));
  return { open: track.open[n], round: track.round[n], spread: track.spread[n] };
}
