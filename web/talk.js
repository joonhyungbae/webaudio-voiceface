/*
 말하는 영상에서 입을 가져온다. 다시 듣기 때 입 부위를 진짜로 말하는 프레임으로 바꿔 끼운다.

 1. 훑기(scan): 영상을 한 프레임씩 넘기며 MediaPipe 로 랜드마크를 찾고 입 모양(벌림·너비)을 잰다.
    그림은 남기지 않아 가볍다. 관객을 기다리는 동안 모든 얼굴의 영상을 미리 훑어 둔다.
 2. 순서(plan): 녹음의 입 모양 트랙(lipsync.js)과 프레임들의 입 모양을 견준다. 맞는 프레임을 고르되, 다음 프레임으로
    이어 가면 덜 튀므로 그쪽을 더 쳐준다. 녹음 전체를 한 번에 풀어 가장 좋은 순서를 정한다(비터비).
 3. 잘라 오기(grab): 그 순서에 실제로 쓰이는 프레임만 아래 얼굴을 잘라 그림으로 둔다.
 4. 재생: 그 순서대로 프레임을 엔진(morph.js)의 그 얼굴 자리에 끼운다. 턱도 영상의 움직임을 따라간다.

 영상이 없거나 준비 중이면 사진을 그물망으로 움직이는 입(morph.animate)으로 대신한다.
*/

import * as R from "./regions.js";
import { TALK_FPS, TALK_CROP_W, TALK_JUMP, TALK_HOLD } from "./settings.js";

const dist = (P, a, b) => Math.hypot(P[2 * a] - P[2 * b], P[2 * a + 1] - P[2 * b + 1]);

/* 프레임 하나의 입 모양: 벌림은 입술 안쪽 사이 / 입 너비, 너비는 입 너비 / 두 눈 사이 */
function mouthShape(P) {
  const w = dist(P, 61, 291);
  return { open: dist(P, 13, 14) / w, width: w / dist(P, 33, 263) };
}

function openVideo(url) {
  const video = Object.assign(document.createElement("video"), { src: url, muted: true, playsInline: true, preload: "auto" });
  return new Promise((ok, no) => {
    video.onloadeddata = () => ok(video);
    video.onerror = () => no(new Error(`영상을 열지 못했습니다: ${url}`));
  });
}

const seek = (video, t) => new Promise((ok) => { video.onseeked = ok; video.currentTime = t; });

export class Talk {
  constructor(makeLandmarker) {
    this.makeLandmarker = makeLandmarker;
    this.packs = new Map();    // 얼굴 번호 → { frames:[{t, P, open, width, bitmap?}], rest, crop, url }
    this.scanning = new Map(); // 얼굴 번호 → 진행 중인 훑기
  }

  /* 영상을 훑어 프레임마다 랜드마크와 입 모양을 잰다. 같은 얼굴은 한 번만. */
  scan(k, url, say = () => {}) {
    if (this.packs.has(k)) return Promise.resolve(this.packs.get(k));
    if (this.scanning.has(k)) return this.scanning.get(k);
    const job = (async () => {
      const lm = await this.makeLandmarker("VIDEO");
      const video = await openVideo(url);
      const vw = video.videoWidth, vh = video.videoHeight;
      const count = Math.floor(video.duration * TALK_FPS);
      const frames = [];
      let crop = null;
      for (let n = 0; n < count; n++) {
        const t = (n + 0.5) / TALK_FPS;
        await seek(video, t);
        const pts = lm.detectForVideo(video, (n + 1) * (1000 / TALK_FPS)).faceLandmarks?.[0];
        if (!pts) continue;
        if (!crop) crop = lowerFace(pts, vw, vh);
        const s = TALK_CROP_W / crop.w;
        const P = new Float32Array(2 * pts.length);
        for (let i = 0; i < pts.length; i++) { P[2 * i] = (pts[i].x * vw - crop.x) * s; P[2 * i + 1] = (pts[i].y * vh - crop.y) * s; }
        frames.push({ t, P, ...mouthShape(P) });
        if (n % 24 === 0) say(`입 모양을 재는 중 ${Math.round((n / count) * 100)}%`);
      }
      lm.close();
      if (frames.length < 10) throw new Error("영상에서 얼굴을 충분히 찾지 못했습니다");
      // 가장 다문 프레임을 「쉬는 입」으로 둔다. 턱이 움직인 만큼을 이 프레임과의 차이로 잰다
      const rest = frames.reduce((a, f, i) => (f.open < frames[a].open ? i : a), 0);
      const pack = { k, url, frames, rest, crop };
      this.packs.set(k, pack);
      return pack;
    })();
    this.scanning.set(k, job);
    job.finally(() => this.scanning.delete(k));
    return job;
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

/* 아래 얼굴(눈 높이부터 턱 아래까지)을 넉넉히 잡는 사각형. 첫 프레임에서 한 번 정해 끝까지 쓴다. */
function lowerFace(pts, vw, vh) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of R.FACE_OVAL) { x0 = Math.min(x0, pts[i].x); x1 = Math.max(x1, pts[i].x); y1 = Math.max(y1, pts[i].y); }
  const yTop = pts[R.RIGHT_EYE_UPPER[4]].y;  // 눈 높이부터 (그물망의 눈 기준점이 잘리지 않게)
  const mx = (x1 - x0) * 0.2, my = (y1 - yTop) * 0.2;
  const x = Math.max(0, (x0 - mx) * vw), y = Math.max(0, (yTop - my) * vh);
  return { x, y, w: Math.min(vw - x, (x1 - x0 + 2 * mx) * vw), h: Math.min(vh - y, (y1 - yTop + 2 * my) * vh) };
}
