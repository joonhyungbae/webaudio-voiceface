/*
 말하는 영상. 얼굴 은행의 얼굴은 모두 영상이고, 다시 듣기 때 입을 이 영상에서 가져온다.

 1. 랜드마크(load): 영상의 프레임마다(TALK_FPS) 얼굴 랜드마크와 입 모양(벌림·너비)이 필요하다.
    faces/NN.lm.json 이 있으면 읽고, 없으면 영상을 한 프레임씩 넘기며 MediaPipe 로 찾는다(영상 하나에 몇 초~1분).
    찾은 것은 serve.py 로 켰을 때 그 파일로 저장해 두어 다음부터는 바로 읽는다.
 2. 기본 얼굴(restFrame): 입을 가장 다문 프레임을 그 얼굴의 기본 모습으로 쓴다.
 3. 순서(plan): 녹음의 입 모양 트랙(lipsync.js)과 프레임들의 입 모양을 견준다. 맞는 프레임을 고르되, 다음 프레임으로
    이어 가면 덜 튀므로 그쪽을 더 쳐준다. 녹음 전체를 한 번에 풀어 가장 좋은 순서를 정한다(비터비).
 4. 잘라 오기(grab): 그 순서에 쓰이는 프레임만 아래 얼굴을 잘라 그림으로 둔다.
*/

import * as R from "./regions.js";
import { TALK_FPS, TALK_CROP_W, TALK_JUMP, TALK_HOLD } from "./settings.js";

const N = 478;
const Q = 16;  // 랜드마크를 정수로 저장할 때 곱하는 수 (1/16 픽셀까지)
const dist = (P, a, b) => Math.hypot(P[2 * a] - P[2 * b], P[2 * a + 1] - P[2 * b + 1]);

/* 프레임 하나의 입 모양: 벌림은 입술 안쪽 사이 / 입 너비, 너비는 입 너비 / 두 눈 사이 */
function mouthShape(P) {
  const w = dist(P, 61, 291);
  // 눈 뜬 정도: 두 눈 각각 (윗눈꺼풀-아랫눈꺼풀) / 눈 너비
  const eye = (dist(P, 159, 145) / dist(P, 33, 133) + dist(P, 386, 374) / dist(P, 263, 362)) / 2;
  return { open: dist(P, 13, 14) / w, width: w / dist(P, 33, 263), eye };
}

/* 기본 얼굴 프레임: 입을 다물고, 입 너비가 평소 같고(오므리거나 벌리지 않고), 눈을 뜬 프레임 */
function restIndex(frames) {
  const med = (k) => frames.map((f) => f[k]).sort((a, b) => a - b)[frames.length >> 1];
  const w = med("width"), e = med("eye"), o = Math.max(1e-3, med("open"));
  let best = 0, bestScore = Infinity;
  frames.forEach((f, i) => {
    const s = f.open / o + 4 * Math.abs(f.width - w) / w + 3 * Math.max(0, e * 0.9 - f.eye) / e;
    if (s < bestScore) { bestScore = s; best = i; }
  });
  return best;
}

export function openVideo(url) {
  const video = Object.assign(document.createElement("video"), { src: url, muted: true, playsInline: true, preload: "auto" });
  return new Promise((ok, no) => {
    video.onloadeddata = () => ok(video);
    video.onerror = () => no(new Error(`영상을 열지 못했습니다: ${url}`));
  });
}

const seek = (video, t) => new Promise((ok) => { video.onseeked = ok; video.currentTime = t; });

const encode = (frames) => {
  const a = new Int16Array(frames.length * 2 * N);
  frames.forEach((f, i) => { for (let j = 0; j < 2 * N; j++) a[i * 2 * N + j] = Math.round(f.P[j] * Q); });
  let s = "";
  const b = new Uint8Array(a.buffer);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
};
const decode = (b64, count) => {
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  const a = new Int16Array(b.buffer);
  return Array.from({ length: count }, (_, i) => Float32Array.from(a.subarray(i * 2 * N, (i + 1) * 2 * N), (v) => v / Q));
};

export class Talk {
  constructor(makeLandmarker) {
    this.makeLandmarker = makeLandmarker;
    this.packs = [];   // 얼굴 번호 → { url, w, h, frames:[{t, P(전체 프레임 좌표), open, width, bitmap?, Pc?}], rest, crop }
  }

  /* 랜드마크 파일을 읽거나, 없으면 영상을 훑어 만든다. */
  async load(k, url, say = () => {}) {
    const lmUrl = url.replace(/\.mp4$/, ".lm.json");
    let pack = null;
    try {
      const r = await fetch(lmUrl, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        const Ps = decode(d.data, d.t.length);
        pack = { url, w: d.w, h: d.h, frames: d.t.map((t, i) => ({ t, P: Ps[i], ...mouthShape(Ps[i]) })) };
      }
    } catch {}
    if (!pack) {
      pack = await this.scan(url, (p) => say(`영상 ${k + 1} 의 얼굴을 재는 중 ${p}%`));
      // serve.py 로 켰으면 저장해 둔다 (다음부터는 바로 읽는다). 정적 주소에서는 조용히 실패한다
      fetch(`/save-landmarks?name=${encodeURIComponent(lmUrl.split("/").pop())}`, {
        method: "POST", body: JSON.stringify({ w: pack.w, h: pack.h, fps: TALK_FPS, t: pack.frames.map((f) => f.t), data: encode(pack.frames) }),
      }).catch(() => {});
    }
    // 입을 다문 평소 얼굴을 기본 얼굴로 둔다. 턱이 움직인 만큼도 이 프레임과의 차이로 잰다
    pack.rest = restIndex(pack.frames);
    pack.crop = lowerFace(pack.frames[pack.rest].P, pack.w, pack.h);
    this.packs[k] = pack;
    return pack;
  }

  /* 영상을 한 프레임씩 넘기며 랜드마크를 찾는다. */
  async scan(url, progress = () => {}) {
    const lm = await this.makeLandmarker("VIDEO");
    const video = await openVideo(url);
    const w = video.videoWidth, h = video.videoHeight;
    const count = Math.floor(video.duration * TALK_FPS);
    const frames = [];
    for (let n = 0; n < count; n++) {
      const t = (n + 0.5) / TALK_FPS;
      await seek(video, t);
      const pts = lm.detectForVideo(video, (n + 1) * (1000 / TALK_FPS)).faceLandmarks?.[0];
      if (!pts) continue;
      const P = new Float32Array(2 * N);
      for (let i = 0; i < N; i++) { P[2 * i] = pts[i].x * w; P[2 * i + 1] = pts[i].y * h; }
      frames.push({ t, P, ...mouthShape(P) });
      if (n % 24 === 0) progress(Math.round((n / count) * 100));
    }
    lm.close();
    if (frames.length < 10) throw new Error(`영상에서 얼굴을 충분히 찾지 못했습니다: ${url}`);
    return { url, w, h, frames };
  }

  /* 기본 얼굴(입을 가장 다문 프레임)을 통째로 그림으로. 얼굴 은행이 이것을 쓴다. */
  async restFrame(pack) {
    const video = await openVideo(pack.url);
    await seek(video, pack.frames[pack.rest].t);
    const c = Object.assign(document.createElement("canvas"), { width: pack.w, height: pack.h });
    c.getContext("2d").drawImage(video, 0, 0);
    return createImageBitmap(c);
  }

  /* 고른 프레임들(번호)의 아래 얼굴을 잘라 그림으로 둔다. indices 가 없으면 전부. */
  async grab(pack, indices, say = () => {}) {
    const want = [...new Set(indices ?? pack.frames.map((_, i) => i))].concat(pack.rest)
      .filter((i) => !pack.frames[i].bitmap).sort((a, b) => a - b);
    if (!want.length) return;
    const video = await openVideo(pack.url);
    const c = pack.crop, s = TALK_CROP_W / c.w;
    const canvas = Object.assign(document.createElement("canvas"), { width: TALK_CROP_W, height: Math.round(c.h * s) });
    const g = canvas.getContext("2d");
    for (let n = 0; n < want.length; n++) {
      const f = pack.frames[want[n]];
      if (f.bitmap) continue;
      await seek(video, f.t);
      g.drawImage(video, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
      f.bitmap = await createImageBitmap(canvas);
      f.Pc = f.P.map((v, i) => (i % 2 ? v - c.y : v - c.x) * s);
      if (n % 24 === 0) say(`입을 잘라 오는 중 ${Math.round((n / want.length) * 100)}%`);
    }
  }

  /* 녹음의 입 모양 트랙에 맞춰 프레임 순서를 정한다. 반환: TALK_FPS 마다 프레임 번호 */
  plan(pack, track) {
    const F = pack.frames, n = F.length;
    // 녹음과 영상의 입 벌림 분포를 맞춘다 (순위로 짝짓기). 녹음이 작게 열리는 사람이어도 영상의 범위를 다 쓴다
    const sortedV = F.map((f) => f.open).sort((a, b) => a - b);
    const target = [];
    const step = track.fps / TALK_FPS;
    for (let t = 0; t * step < track.open.length; t++) target.push(track.open[Math.floor(t * step)]);
    const sortedA = target.slice().sort((a, b) => a - b);
    const rank = (v) => { let lo = 0, hi = sortedA.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (sortedA[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, sortedA.length - 1); };
    const want = target.map((v) => (v < 0.04 ? sortedV[0] : sortedV[Math.min(n - 1, Math.round(rank(v) * (n - 1)))]));
    const spread = Math.max(1e-3, sortedV[n - 1] - sortedV[0]);
    // 비터비: 맞지 않는 값 + 옮겨 가는 값의 합이 가장 작은 프레임 줄
    const T = want.length;
    let cost = new Float32Array(n), prev = new Float32Array(n);
    const back = [];
    for (let j = 0; j < n; j++) cost[j] = ((F[j].open - want[0]) / spread) ** 2;
    for (let t = 1; t < T; t++) {
      [prev, cost] = [cost, prev];
      let best = 0;
      for (let j = 1; j < n; j++) if (prev[j] < prev[best]) best = j;
      const bt = new Int16Array(n);
      for (let j = 0; j < n; j++) {
        let c = prev[best] + TALK_JUMP, from = best;
        if (j > 0 && prev[j - 1] < c) { c = prev[j - 1]; from = j - 1; }          // 다음 프레임으로 이어 가기
        if (prev[j] + TALK_HOLD < c) { c = prev[j] + TALK_HOLD; from = j; }        // 멈춰 있기
        cost[j] = c + ((F[j].open - want[t]) / spread) ** 2;
        bt[j] = from;
      }
      back.push(bt);
    }
    let j = 0;
    for (let i = 1; i < n; i++) if (cost[i] < cost[j]) j = i;
    const seq = new Int16Array(T);
    seq[T - 1] = j;
    for (let t = T - 1; t > 0; t--) { j = back[t - 1][j]; seq[t - 1] = j; }
    return seq;
  }
}

/* 아래 얼굴(눈 높이부터 턱 아래까지)을 넉넉히 잡는 사각형 (픽셀). 기본 얼굴 프레임에서 정해 끝까지 쓴다. */
function lowerFace(P, w, h) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of R.FACE_OVAL) { x0 = Math.min(x0, P[2 * i]); x1 = Math.max(x1, P[2 * i]); y1 = Math.max(y1, P[2 * i + 1]); }
  const yTop = P[2 * R.RIGHT_EYE_UPPER[4] + 1];  // 눈 높이부터 (그물망의 눈 기준점이 잘리지 않게)
  const mx = (x1 - x0) * 0.25, my = (y1 - yTop) * 0.25;
  const x = Math.max(0, x0 - mx), y = Math.max(0, yTop - my);
  return { x, y, w: Math.min(w - x, x1 - x0 + 2 * mx), h: Math.min(h - y, y1 - yTop + 2 * my) };
}
