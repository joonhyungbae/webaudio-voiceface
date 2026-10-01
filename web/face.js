/*
 출력. 얼굴 은행을 읽고, 엔진(morph.js)으로 한 얼굴을 그리고, 흩어뜨리고, 자막을 얹는다.

 얼굴 은행 (web/faces/)
   faces.json 에 적힌 말하는 영상들을 읽는다. 카메라를 정면으로 보고 말하는 영상이면 된다.
   영상마다 프레임별 랜드마크(NN.lm.json)를 쓰고, 입을 가장 다문 프레임이 그 얼굴의 기본 모습이 된다.

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
  /* 얼굴 은행: faces.json 에 적힌 말하는 영상들. 영상마다 랜드마크를 읽고(없으면 만들고),
     입을 가장 다문 프레임을 그 얼굴의 기본 모습으로 엔진에 들인다. say(글) 로 진행을 알린다. */
  async load(say = () => {}) {
    say("얼굴 영상을 읽는 중");
    const list = await (await fetch("faces/faces.json", { cache: "no-store" })).json();
    this.morph = new Morph();
    this.talk = new Talk(landmarker);
    this.videos = [];
    this.skipped = [];
    for (const f of list) {
      const url = `faces/${f.video}`;
      try {
        const k = this.videos.length;
        const pack = await this.talk.load(k, url, say);
        const rest = await this.talk.restFrame(pack);
        this.morph.addFace(rest, pack.frames[pack.rest].P);
        this.videos.push(url);
        say(`얼굴 영상을 읽는 중 ${this.videos.length}/${list.length}`);
      } catch (e) {
        this.skipped.push(f.video);
        this.talk.packs.length = this.videos.length;
      }
    }
    if (this.morph.count < 2) throw new Error("읽은 얼굴 영상이 두 편보다 적습니다. web/faces/ 를 보세요");
    this.morph.build();
    this.source = `말하는 얼굴 ${this.morph.count}편` + (this.skipped.length ? ` (읽지 못해 뺀 것: ${this.skipped.join(", ")})` : "");
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
    this.talk = bank.talk;
    this.wanted = new Set();    // 전시 화면이 잘라 오기를 걸어 둔 얼굴
  }

  /* 이 얼굴에 말하는 영상이 있나 (얼굴 은행은 모두 영상이다) */
  canTalk(k) { return !!this.talk.packs[k]; }

  /* 다시 듣기 직전: 순서를 정하고 그 순서에 쓰는 프레임만 잘라 온다. */
  async prepareTalk(k, track, say) {
    const pack = this.talk.packs[k];
    const seq = this.talk.plan(pack, track);
    await this.talk.grab(pack, seq, say);
    this.ensureLow(pack);
    return { pack, seq };
  }

  ensureLow(pack) {
    const r = pack.frames[pack.rest];
    if (!pack.low && r.bitmap) pack.low = lowImage(r.bitmap, r.Pc);
  }

  /* 영상 프레임을 끼우거나 걷는다. talk = { k, t, need } (t 는 영상 속 시각, need 는 쓰는 프레임 번호들).
     아직 잘라 오지 않았으면(전시 화면) 잘라 오기를 걸어 두고 이번에는 기본 얼굴로 그린다. */
  applyTalk(talk) {
    const m = this.bank.morph;
    if (!talk) { if (m.talkK != null) m.restoreStill(m.talkK); return false; }
    const pack = this.talk.packs[talk.k];
    if (!pack) return false;
    if (!pack.frames[pack.rest].bitmap || (talk.need && !this.wanted.has(talk.k))) {
      if (!this.wanted.has(talk.k)) {
        this.wanted.add(talk.k);
        this.talk.grab(pack, talk.need).then(() => this.ensureLow(pack)).catch(() => {});
      }
      if (!pack.frames[pack.rest].bitmap) return false;
    }
    this.ensureLow(pack);
    if (m.talkK != null && m.talkK !== talk.k) m.restoreStill(m.talkK);
    if (m.talkK !== talk.k) {
      // 입을 다문 프레임의 자리를 턱 움직임의 기준으로 삼는다
      const r = pack.frames[pack.rest];
      m.setFrame(talk.k, r.bitmap, r.Pc, pack.low);
      m.setTalk(talk.k, m.faces[talk.k].QX.slice());
    }
    let best = -1;
    pack.frames.forEach((f, i) => {
      if (f.bitmap && (best < 0 || Math.abs(f.t - talk.t) < Math.abs(pack.frames[best].t - talk.t))) best = i;
    });
    const f = pack.frames[best];
    m.setFrame(talk.k, f.bitmap, f.Pc, pack.low);
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
