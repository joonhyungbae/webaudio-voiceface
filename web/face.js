/*
 출력. 얼굴 은행을 읽고, 엔진(morph.js)으로 한 얼굴을 그리고, 흩어뜨리고, 자막을 얹는다.

 얼굴 은행 (web/faces/)
   faces.json 에 적힌 그림들을 읽는다. 정면이고 입을 다문 사진이면 크기와 위치는 달라도 된다.
   처음 읽을 때 MediaPipe 가 그림마다 얼굴 랜드마크 478점을 찾는다(브라우저 안에서, 한 장에 0.1초 안팎).

 그리는 장면
   idle      기다리는 동안. 은행의 얼굴들이 천천히 서로에게 스며든다
   face      조합된 얼굴. 덜 맞춰졌으면 가로 띠가 어긋난다. 입·눈꺼풀·고개가 움직인다
   disperse  얼굴이 조각으로 흩어지고 마지막 문장이 남는다
*/

import { Morph, lowImage } from "./morph.js";
import { Talk } from "./talk.js";
import { OUT_W as W, OUT_H as H, TILE_COLS, TILE_ROWS, BLINK_EVERY } from "./settings.js";

const LIB = new URL("vendor/mediapipe", document.baseURI).href;

// MediaPipe 는 사용 기록을 구글 서버(odml.pa.googleapis.com)로 보낸다. 이 작품은 아무것도 밖으로 보내지 않으므로
// 그 주소로 가는 요청만 여기서 막는다. 라이브러리 파일은 고치지 않는다.
if (!window.__voicefaceNoLog) {
  window.__voicefaceNoLog = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("odml.pa.googleapis.com")) return Promise.resolve(new Response(null, { status: 204 }));
    return realFetch(input, init);
  };
}
const MODEL = new URL("models/face_landmarker.task", document.baseURI).href;

async function landmarker(runningMode = "IMAGE") {
  const vision = await import(`${LIB}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${LIB}/wasm`);
  return vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
    runningMode,
    numFaces: 1,
  });
}

export class FaceBank {
  /* 그림을 읽고 랜드마크를 찾아 엔진에 들인다. say(글) 로 진행을 알린다. */
  async load(say = () => {}) {
    say("얼굴 그림을 읽는 중");
    const list = await (await fetch("faces/faces.json", { cache: "no-store" })).json();
    this.morph = new Morph();
    const lm = await landmarker();
    this.skipped = [];
    this.videos = [];
    for (const f of list) {
      const img = new Image();
      img.src = `faces/${f.src}`;
      await img.decode();
      const r = lm.detect(img);
      if (!r.faceLandmarks?.length) { this.skipped.push(f.src); continue; }
      this.morph.addFace(img, r.faceLandmarks[0]);
      this.videos.push(f.video ? `faces/${f.video}` : null);
      say(`얼굴을 찾는 중 ${this.morph.count}/${list.length}`);
    }
    lm.close();
    if (this.morph.count < 2) throw new Error("얼굴을 찾은 그림이 두 장보다 적습니다. web/faces/ 를 보세요");
    this.morph.build();
    const nv = this.videos.filter(Boolean).length;
    this.source = `사진 얼굴 ${this.morph.count}장` + (nv ? ` · 말하는 영상 ${nv}편` : "") + (this.skipped.length ? ` (얼굴을 못 찾아 뺀 것: ${this.skipped.join(", ")})` : "");
  }

  get count() { return this.morph ? this.morph.count : 0; }
}

/* 사람처럼 가끔 눈을 감는다. 시각만으로 정해져 두 화면에서 같게 나온다. */
function blinkAt(now) {
  const slot = Math.floor(now / BLINK_EVERY);
  const r = Math.sin(slot * 91.7) * 43758.5453;
  const at = slot * BLINK_EVERY + (r - Math.floor(r)) * (BLINK_EVERY - 0.3);
  const t = (now - at) / 0.16;
  return t > 0 && t < 2 ? 1 - Math.abs(1 - t) : 0;
}

export class FaceRenderer {
  constructor(bank) {
    this.bank = bank;
    this.comp = Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.cg = this.comp.getContext("2d");
    this.tiles = null;
    this.talk = new Talk(landmarker);
    this.wanted = new Set();    // 전시 화면이 통째로 준비를 걸어 둔 얼굴
  }

  /* 이 얼굴에 말하는 영상이 있나 */
  canTalk(k) { return !!this.bank.videos?.[k]; }

  /* 관객을 기다리는 동안 모든 영상을 미리 훑어 둔다 (랜드마크와 입 모양만, 그림은 남기지 않는다). */
  async scanAll(say = () => {}) {
    for (let k = 0; k < this.bank.count; k++) {
      if (!this.canTalk(k)) continue;
      try { await this.talk.scan(k, this.bank.videos[k]); } catch {}
    }
    say();
  }

  /* 다시 듣기 직전: 순서를 정하고 그 순서에 쓰는 프레임만 잘라 온다. */
  async prepareTalk(k, track, say) {
    const pack = await this.talk.scan(k, this.bank.videos[k], say);
    const seq = this.talk.plan(pack, track);
    await this.talk.grab(pack, seq, say);
    this.ensureLow(pack);
    return { pack, seq };
  }

  ensureLow(pack) {
    const r = pack.frames[pack.rest];
    if (!pack.low && r.bitmap) pack.low = lowImage(r.bitmap, r.P);
  }

  /* 영상 프레임을 끼우거나 걷는다. talk = { k, t } (t 는 영상 속 시각).
     아직 준비가 안 됐으면(전시 화면) 통째로 준비를 걸어 두고 이번에는 사진으로 그린다. */
  applyTalk(talk) {
    const m = this.bank.morph;
    if (!talk) { if (m.talkK != null) m.restoreStill(m.talkK); return false; }
    const pack = this.talk.packs.get(talk.k);
    if (!pack || !pack.frames[pack.rest].bitmap) {
      if (!this.wanted.has(talk.k) && this.canTalk(talk.k)) {
        this.wanted.add(talk.k);
        this.talk.scan(talk.k, this.bank.videos[talk.k]).then((p) => this.talk.grab(p)).then(() => this.ensureLow(this.talk.packs.get(talk.k))).catch(() => {});
      }
      return false;
    }
    this.ensureLow(pack);
    if (m.talkK != null && m.talkK !== talk.k) m.restoreStill(m.talkK);
    if (m.talkK !== talk.k) {
      // 입을 다문 프레임의 자리를 턱 움직임의 기준으로 삼는다
      const r = pack.frames[pack.rest];
      m.setFrame(talk.k, r.bitmap, r.P, pack.low);
      m.setTalk(talk.k, m.faces[talk.k].QX.slice());
    }
    let best = -1;
    pack.frames.forEach((f, i) => {
      if (f.bitmap && (best < 0 || Math.abs(f.t - talk.t) < Math.abs(pack.frames[best].t - talk.t))) best = i;
    });
    const f = pack.frames[best];
    m.setFrame(talk.k, f.bitmap, f.P, pack.low);
    return true;
  }

  /* 한 얼굴을 엔진에서 그려 this.comp 에 옮긴다. */
  compose(c, now = 0) {
    const m = this.bank.morph;
    // 영상 입을 쓰면 그물망으로 입을 벌리지 않는다 (영상이 이미 벌리고 있다)
    const video = this.applyTalk(c.talk);
    m.blend(c);
    m.animate({
      open: video ? 0 : c.open || 0, round: video ? 0 : c.round || 0, spread: video ? 0 : c.spread || 0,
      blink: blinkAt(now), tilt: (c.tilt || 0) + 0.012 * Math.sin(now * 0.6), nod: (c.open || 0) * 4 + 2 * Math.sin(now * 0.45),
    });
    const out = m.render(1 - (c.formed ?? 1), now);
    this.cg.drawImage(out, 0, 0);
  }

  /* 화면 한가운데에 맞춰 그린다. */
  drawFace(g, cw, ch) {
    const s = Math.max(cw / W, (ch * 0.88) / H);
    const w = W * s, h = H * s;
    g.drawImage(this.comp, (cw - w) / 2, 0, w, h);
  }

  /* 흩어지기 시작. 지금 얼굴을 조각으로 자른다. */
  startDisperse() {
    const tw = W / TILE_COLS, th = H / TILE_ROWS;
    this.tiles = [];
    for (let y = 0; y < TILE_ROWS; y++) {
      for (let x = 0; x < TILE_COLS; x++) {
        const dx = x - TILE_COLS / 2 + 0.5, dy = y - TILE_ROWS / 2 + 0.5;
        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
        this.tiles.push({
          sx: x * tw, sy: y * th, tw, th,
          vx: Math.cos(a) * (20 + Math.random() * 80), vy: Math.sin(a) * (20 + Math.random() * 80) - 10,
          vr: (Math.random() - 0.5) * 1.2, delay: Math.random() * 0.4,
        });
      }
    }
    this.frozen = Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.frozen.getContext("2d").drawImage(this.comp, 0, 0);
  }

  drawDisperse(g, cw, ch, t, dur, final, p) {
    const s = Math.max(cw / W, (ch * 0.88) / H);
    const k = Math.min(1, t / dur);
    g.save();
    g.translate((cw - W * s) / 2, 0);
    g.scale(s, s);
    // 첫 순간에는 조각 사이 틈이 보이지 않게 온 얼굴을 깔았다가 빠르게 걷는다
    if (t < 0.4) { g.globalAlpha = 1 - t / 0.4; g.drawImage(this.frozen, 0, 0); g.globalAlpha = 1; }
    for (const tile of this.tiles || []) {
      const tt = Math.max(0, t - tile.delay * dur * 0.5);
      g.save();
      g.globalAlpha = Math.max(0, 1 - k * 1.1);
      g.translate(tile.sx + tile.tw / 2 + tile.vx * tt, tile.sy + tile.th / 2 + tile.vy * tt);
      g.rotate(tile.vr * tt);
      g.drawImage(this.frozen, tile.sx, tile.sy, tile.tw, tile.th, -tile.tw / 2, -tile.th / 2, tile.tw, tile.th);
      g.restore();
    }
    g.restore();
    g.globalAlpha = Math.min(1, Math.max(0, (k - 0.3) / 0.4));
    text(g, final, cw / 2, ch * 0.5, cw * 0.82, ch * 0.045, p.ink);
    g.globalAlpha = 1;
  }

  /* 기다리는 동안. 은행의 얼굴들이 차례로 서로에게 스며든다. 흐리게 깔고 글을 얹는다. */
  drawIdle(g, cw, ch, now, lines, p) {
    const n = this.bank.count;
    const x = (now / 6) % n;
    this.compose({ contour: x, eyes: (x + 1.3) % n, nose: (x + 2.1) % n, mouth: (x + 0.7) % n, formed: 1 }, now);
    g.globalAlpha = 0.35;
    this.drawFace(g, cw, ch);
    g.globalAlpha = 1;
    lines.forEach((l, i) => text(g, l, cw / 2, ch * (0.78 + i * 0.06), cw * 0.85, ch * (i ? 0.03 : 0.042), p.ink));
  }
}

/* 줄을 접어 가운데에 쓴다. */
export function text(g, str, x, y, maxW, size, color) {
  g.fillStyle = color;
  g.font = `500 ${size}px "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = String(str).split(" ");
  const rows = [];
  let row = "";
  for (const w of words) {
    const tryRow = row ? `${row} ${w}` : w;
    if (g.measureText(tryRow).width > maxW && row) { rows.push(row); row = w; } else row = tryRow;
  }
  if (row) rows.push(row);
  rows.forEach((r, i) => g.fillText(r, x, y + (i - (rows.length - 1) / 2) * size * 1.35));
}
