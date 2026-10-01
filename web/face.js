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

import { Morph } from "./morph.js";
import { OUT_W as W, OUT_H as H, TILE_COLS, TILE_ROWS, BLINK_EVERY } from "./settings.js";

const LIB = new URL("vendor/mediapipe", document.baseURI).href;
const MODEL = new URL("models/face_landmarker.task", document.baseURI).href;

async function landmarker() {
  const vision = await import(`${LIB}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${LIB}/wasm`);
  return vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
    runningMode: "IMAGE",
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
    for (const f of list) {
      const img = new Image();
      img.src = `faces/${f.src}`;
      await img.decode();
      const r = lm.detect(img);
      if (!r.faceLandmarks?.length) { this.skipped.push(f.src); continue; }
      this.morph.addFace(img, r.faceLandmarks[0]);
      say(`얼굴을 찾는 중 ${this.morph.count}/${list.length}`);
    }
    lm.close();
    if (this.morph.count < 2) throw new Error("얼굴을 찾은 그림이 두 장보다 적습니다. web/faces/ 를 보세요");
    this.morph.build();
    this.source = `사진 얼굴 ${this.morph.count}장` + (this.skipped.length ? ` (얼굴을 못 찾아 뺀 것: ${this.skipped.join(", ")})` : "");
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
  }

  /* 한 얼굴을 엔진에서 그려 this.comp 에 옮긴다. */
  compose(c, now = 0) {
    const m = this.bank.morph;
    m.blend(c);
    m.animate({
      open: c.open || 0, round: c.round || 0, spread: c.spread || 0,
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
