/*
 출력. 얼굴 은행에서 띠를 가져와 한 얼굴로 조합하고, 입을 움직이고, 흩어뜨리고, 자막을 얹는다.

 얼굴 은행
   web/faces/faces.json 이 있으면 그 그림들을 쓴다. 미리 만들어 둔 얼굴(AI 로 만든 것, 그린 것,
   찍은 것)을 넣는 자리다. 크기가 같고 정면이며 눈·코·입 높이가 대략 맞아야 띠가 이어진다.
     [{ "src": "01.png", "mouth": [0.5, 0.71, 0.18] }, ...]   mouth 는 입 가운데 x, y 와 입 너비(비율)
   없으면 선으로 그린 얼굴 FACE_COUNT 개를 만들어 쓴다. FACE_SEED 가 같으면 늘 같은 얼굴들이다.

 그리는 장면
   idle      기다리는 동안. 은행의 얼굴들이 조각으로 떠다닌다
   face      조합된 얼굴. formed 가 낮으면 띠가 어긋나 흔들린다
   disperse  얼굴이 조각으로 흩어지고 마지막 문장이 남는다
*/

import {
  FACE_COUNT, FACE_SEED, FACE_W as W, FACE_H as H, BANDS, BAND_FEATHER, TILE_COLS, TILE_ROWS,
} from "./settings.js";

/* 씨앗이 같으면 같은 수열을 내는 난수. 두 화면이 같은 얼굴을 그려야 한다. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = (w = W, h = H) => Object.assign(document.createElement("canvas"), { width: w, height: h });

/* 선으로 얼굴 하나를 그린다. 눈·코·입은 BANDS 안에 들어가게 한다. */
function drawFace(r, ink, paper) {
  const c = canvas();
  const g = c.getContext("2d");
  const R = (a, b) => a + (b - a) * r();
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = g.fillStyle = ink;
  g.lineCap = g.lineJoin = "round";

  const cx = W / 2;
  const fw = R(0.3, 0.38) * W, top = R(0.14, 0.2) * H, chin = R(0.86, 0.92) * H;
  const jaw = R(0.55, 0.85), cheek = R(0.62, 0.72) * H;

  // 머리카락 (뒤쪽)
  const hair = Math.floor(r() * 4);
  g.globalAlpha = 0.85;
  if (hair === 2) {
    g.beginPath();
    g.moveTo(cx - fw * 1.15, H * 0.98);
    g.bezierCurveTo(cx - fw * 1.4, top - 40, cx + fw * 1.4, top - 40, cx + fw * 1.15, H * 0.98);
    g.fill();
  }
  g.globalAlpha = 1;

  // 윤곽
  const outline = () => {
    g.beginPath();
    g.moveTo(cx, top);
    g.bezierCurveTo(cx + fw * 1.05, top, cx + fw * 1.02, cheek * 0.85, cx + fw * 0.98, cheek);
    g.bezierCurveTo(cx + fw * jaw, chin - 20, cx + fw * 0.3, chin, cx, chin);
    g.bezierCurveTo(cx - fw * 0.3, chin, cx - fw * jaw, chin - 20, cx - fw * 0.98, cheek);
    g.bezierCurveTo(cx - fw * 1.02, cheek * 0.85, cx - fw * 1.05, top, cx, top);
    g.closePath();
  };
  g.fillStyle = paper;
  outline();
  g.fill();
  g.fillStyle = ink;
  g.lineWidth = 3;
  outline();
  g.stroke();

  // 목과 귀
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx - fw * 0.42, chin - 30); g.lineTo(cx - fw * 0.45, H);
  g.moveTo(cx + fw * 0.42, chin - 30); g.lineTo(cx + fw * 0.45, H);
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * fw * 1.0, H * 0.47, 14, 30, 0, s > 0 ? -1.4 : 1.7, s > 0 ? 1.4 : 4.5);
    g.stroke();
  }

  // 머리카락 (앞쪽)
  if (hair === 1 || hair === 2) {
    g.beginPath();
    g.moveTo(cx - fw * 1.02, H * 0.36);
    g.bezierCurveTo(cx - fw * 1.1, top - 50, cx + fw * 1.1, top - 50, cx + fw * 1.02, H * 0.36);
    g.bezierCurveTo(cx + fw * 0.5, top + R(10, 60), cx - fw * 0.3, top + R(20, 80), cx - fw * 1.02, H * 0.36);
    g.fill();
  } else if (hair === 3) {
    g.beginPath();
    g.moveTo(cx - fw * 1.0, H * 0.3);
    g.bezierCurveTo(cx - fw * 1.1, top - 30, cx + fw * 0.1, top - 40, cx + fw * 0.15, top + 10);
    g.bezierCurveTo(cx - fw * 0.3, top + 30, cx - fw * 0.8, top + 50, cx - fw * 1.0, H * 0.3);
    g.fill();
  }

  // 눈과 눈썹 (눈 띠 안)
  const eyeY = R(0.4, 0.44) * H, gap = R(0.36, 0.5) * fw, ew = R(0.22, 0.32) * fw, eh = R(0.08, 0.16) * fw;
  const browUp = R(0.06, 0.1) * H, browTilt = R(-0.15, 0.2);
  g.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    const ex = cx + s * gap;
    g.beginPath();
    g.moveTo(ex - ew / 2, eyeY);
    g.quadraticCurveTo(ex, eyeY - eh, ex + ew / 2, eyeY);
    g.quadraticCurveTo(ex, eyeY + eh * 0.6, ex - ew / 2, eyeY);
    g.stroke();
    g.beginPath();
    g.arc(ex, eyeY - eh * 0.05, eh * 0.38, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = R(3, 6);
    g.beginPath();
    g.moveTo(ex - s * ew * 0.6, eyeY - browUp + browTilt * 20);
    g.quadraticCurveTo(ex, eyeY - browUp - 8, ex + s * ew * 0.6, eyeY - browUp - browTilt * 20);
    g.stroke();
    g.lineWidth = 2.5;
  }

  // 코 (코 띠 안)
  const noseTop = BANDS.nose[0] * H + 4, noseBot = R(0.57, 0.6) * H, nw = R(0.12, 0.2) * fw;
  g.beginPath();
  g.moveTo(cx - 4, noseTop);
  g.quadraticCurveTo(cx - nw * 0.2, (noseTop + noseBot) / 2, cx - nw * 0.5, noseBot);
  g.quadraticCurveTo(cx, noseBot + 10, cx + nw * 0.5, noseBot);
  g.stroke();

  // 입 (입 띠 안)
  const my = R(0.69, 0.72) * H, mw = R(0.38, 0.56) * fw, lip = R(4, 12);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - mw / 2, my);
  g.quadraticCurveTo(cx - mw / 4, my - lip, cx, my - lip * 0.4);
  g.quadraticCurveTo(cx + mw / 4, my - lip, cx + mw / 2, my);
  g.quadraticCurveTo(cx, my + lip * 1.4, cx - mw / 2, my);
  g.stroke();
  g.beginPath();
  g.moveTo(cx - mw / 2, my);
  g.lineTo(cx + mw / 2, my);
  g.stroke();

  return { img: c, mouth: [0.5, my / H, mw / W] };
}

export class FaceBank {
  constructor() {
    this.faces = [];
  }

  /* web/faces/faces.json 이 있으면 그림을, 없으면 선 얼굴을 만든다. */
  async load(ink, paper) {
    this.faces = [];
    try {
      const list = await (await fetch("faces/faces.json", { cache: "no-store" })).json();
      for (const f of list) {
        const im = new Image();
        im.src = `faces/${f.src}`;
        await im.decode();
        const c = canvas();
        c.getContext("2d").drawImage(im, 0, 0, W, H);
        this.faces.push({ img: c, mouth: f.mouth || [0.5, 0.71, 0.18] });
      }
      this.source = `그림 ${this.faces.length}장 (web/faces)`;
    } catch {
      const r = rng(FACE_SEED);
      for (let i = 0; i < FACE_COUNT; i++) this.faces.push(drawFace(r, ink, paper));
      this.source = `선으로 그린 얼굴 ${FACE_COUNT}개`;
    }
  }

  get count() { return this.faces.length; }
}

/* 소수 번호면 두 얼굴을 섞어 그린다. */
function blendDraw(g, bank, idx, sx, sy, sw, sh, dx, dy) {
  const a = Math.floor(idx), b = Math.min(bank.count - 1, a + 1), t = idx - a;
  g.globalAlpha = 1;
  g.drawImage(bank.faces[a].img, sx, sy, sw, sh, dx, dy, sw, sh);
  if (t > 0.02 && b !== a) {
    g.globalAlpha = t;
    g.drawImage(bank.faces[b].img, sx, sy, sw, sh, dx, dy, sw, sh);
  }
  g.globalAlpha = 1;
}

export class FaceRenderer {
  constructor(bank) {
    this.bank = bank;
    this.comp = canvas();
    this.cg = this.comp.getContext("2d");
    this.band = canvas();
    this.bg = this.band.getContext("2d");
    this.tiles = null;
    this.idleTiles = null;
  }

  /* 띠들을 모아 얼굴 한 장을 만든다. */
  compose(c) {
    const g = this.cg;
    g.clearRect(0, 0, W, H);
    blendDraw(g, this.bank, c.contour, 0, 0, W, H, 0, 0);
    const f = BAND_FEATHER * H;
    for (const key of ["eyes", "nose", "mouth"]) {
      const [y0, y1, xa, xb] = BANDS[key];
      const top = y0 * H - f, h = (y1 - y0) * H + 2 * f;
      const x0 = xa * W, w = (xb - xa) * W;
      const b = this.bg;
      b.clearRect(0, 0, W, H);
      blendDraw(b, this.bank, c[key], x0, top, w, h, x0, top);
      // 위아래와 양옆을 부드럽게 지워 아래 얼굴과 섞이게 한다
      b.globalCompositeOperation = "destination-in";
      const gv = b.createLinearGradient(0, top, 0, top + h);
      gv.addColorStop(0, "rgba(0,0,0,0)");
      gv.addColorStop(f / h, "rgba(0,0,0,1)");
      gv.addColorStop(1 - f / h, "rgba(0,0,0,1)");
      gv.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = gv;
      b.fillRect(x0, top, w, h);
      const gh = b.createLinearGradient(x0, 0, x0 + w, 0);
      gh.addColorStop(0, "rgba(0,0,0,0)");
      gh.addColorStop(0.15, "rgba(0,0,0,1)");
      gh.addColorStop(0.85, "rgba(0,0,0,1)");
      gh.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = gh;
      b.fillRect(x0, top, w, h);
      b.globalCompositeOperation = "source-over";
      g.drawImage(this.band, x0, top, w, h, x0, top, w, h);
    }
    // 입 자리는 입 띠를 준 얼굴들의 입 자리를 섞어 쓴다
    const ia = Math.floor(c.mouth), ib = Math.min(this.bank.count - 1, ia + 1), t = c.mouth - ia;
    const ma = this.bank.faces[ia].mouth, mb = this.bank.faces[ib].mouth;
    this.mouthAt = ma.map((v, i) => v + (mb[i] - v) * t);
  }

  /* 입을 벌린다. 입 아래를 조금 내리고 그 틈을 어둡게 채운다. */
  drawOpen(g, open, ink) {
    if (open < 0.02) return;
    const [mx, my, mw] = this.mouthAt;
    const x = mx * W, y = my * H, w = mw * W;
    const drop = open * w * 0.28;
    g.drawImage(this.comp, 0, y, W, H - y, 0, y + drop, W, H - y);
    g.fillStyle = ink;
    g.beginPath();
    g.ellipse(x, y + drop / 2, w * 0.42, drop / 2 + 2, 0, 0, Math.PI * 2);
    g.fill();
  }

  /* 화면 한가운데에 얼굴을 맞춰 그린다. formed 가 낮으면 가로 띠들이 어긋난다. */
  drawFace(g, cw, ch, c, p, now) {
    const s = Math.min(cw / W, (ch * 0.86) / H);
    g.save();
    g.translate(cw / 2, ch * 0.45);
    g.rotate(c.tilt);
    g.scale(s, s);
    g.translate(-W / 2, -H / 2);
    const strips = 40, sh = H / strips;
    const loose = 1 - c.formed;
    for (let i = 0; i < strips; i++) {
      const n = Math.sin(i * 12.9898 + Math.floor(now * 6) * 78.233) * 43758.5453;
      const off = (n - Math.floor(n) - 0.5) * W * 0.22 * loose * loose;
      g.drawImage(this.comp, 0, i * sh, W, sh + 1, off, i * sh, W, sh + 1);
    }
    this.drawOpen(g, c.open * c.formed, p.ink);
    g.restore();
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
          sx: x * tw, sy: y * th, x: x * tw, y: y * th, tw, th,
          vx: Math.cos(a) * (20 + Math.random() * 80), vy: Math.sin(a) * (20 + Math.random() * 80) - 10,
          r: 0, vr: (Math.random() - 0.5) * 1.2, delay: Math.random() * 0.4,
        });
      }
    }
  }

  drawDisperse(g, cw, ch, t, dur, final, p) {
    const s = Math.min(cw / W, (ch * 0.86) / H);
    const k = Math.min(1, t / dur);
    g.save();
    g.translate(cw / 2, ch * 0.45);
    g.scale(s, s);
    g.translate(-W / 2, -H / 2);
    for (const tile of this.tiles || []) {
      const tt = Math.max(0, t - tile.delay * dur * 0.5);
      g.save();
      g.globalAlpha = Math.max(0, 1 - k * 1.1);
      g.translate(tile.x + tile.tw / 2 + tile.vx * tt, tile.y + tile.th / 2 + tile.vy * tt);
      g.rotate(tile.vr * tt);
      g.drawImage(this.comp, tile.sx, tile.sy, tile.tw, tile.th, -tile.tw / 2, -tile.th / 2, tile.tw, tile.th);
      g.restore();
    }
    g.restore();
    // 마지막 문장이 떠오른다
    g.globalAlpha = Math.min(1, Math.max(0, (k - 0.3) / 0.4));
    text(g, final, cw / 2, ch * 0.5, cw * 0.82, ch * 0.045, p.ink);
    g.globalAlpha = 1;
  }

  /* 기다리는 동안. 은행의 얼굴 조각들이 천천히 떠다닌다. */
  drawIdle(g, cw, ch, now, lines, p) {
    if (!this.idleTiles) {
      const r = rng(FACE_SEED + 1);
      this.idleTiles = Array.from({ length: 60 }, () => ({
        f: Math.floor(r() * this.bank.count), sx: r() * (W - 120), sy: r() * (H - 120), sz: 60 + r() * 80,
        x: r(), y: r(), vx: (r() - 0.5) * 0.01, vy: (r() - 0.5) * 0.01, ph: r() * 6,
      }));
    }
    const s = cw / W;
    for (const t of this.idleTiles) {
      const x = ((t.x + t.vx * now) % 1 + 1) % 1, y = ((t.y + t.vy * now) % 1 + 1) % 1;
      g.globalAlpha = 0.18 + 0.12 * Math.sin(now * 0.5 + t.ph);
      g.drawImage(this.bank.faces[t.f].img, t.sx, t.sy, t.sz, t.sz, x * cw - t.sz * s / 2, y * ch - t.sz * s / 2, t.sz * s, t.sz * s);
    }
    g.globalAlpha = 1;
    lines.forEach((l, i) => text(g, l, cw / 2, ch * (0.46 + i * 0.07), cw * 0.85, ch * (i ? 0.03 : 0.045), p.ink));
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
