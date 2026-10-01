/*
 얼굴 엔진. 사진 여러 장을 랜드마크 그물망으로 엮어 한 얼굴로 섞고, 입·턱·눈꺼풀을 움직인다.

 1. 얼굴마다 MediaPipe 랜드마크 478점을 받아, 두 눈이 같은 자리에 오도록 기준 틀로 옮긴다.
    윤곽 바깥(머리카락·배경)도 따라오도록 윤곽을 두 겹 넓힌 점과 화면 테두리 점을 더한다.
 2. 모든 얼굴의 평균 모양으로 삼각형 그물망(들로네)을 한 번 만든다. 입 안쪽 삼각형은 뺀다(입을 벌리면 비는 자리).
 3. 그물망의 점마다 「눈·눈썹·코·입·나머지」 소속을 매끄럽게 정해 두고, 부위마다 어느 얼굴을 얼마나
    가져올지(rule.js 의 결과)를 곱해 점마다 얼굴별 비율을 만든다.
 4. 목표 모양 = 얼굴별 비율로 섞은 점 자리. 그 위에 얼굴마다 자기 사진을 붙여 비율만큼 더해 그린다(WebGL).
    피부색은 윤곽을 준 얼굴 쪽으로 맞춘다. 그래서 이음새 없이 한 장의 사진처럼 섞인다.
 5. 입을 벌리면 생기는 빈자리는 마지막 단계에서 입안과 치아로 채운다.
*/

import * as R from "./regions.js";
import { OUT_W, OUT_H, EYE_LINE, EYE_GAP, REGION_NEAR, REGION_FAR, COLOR_MATCH, COLOR_BLUR, CONTOUR_SNAP, JAW_DROP } from "./settings.js";

const N = 478;

// ─── 작은 도구들 ─────────────────────────────────────────────────────────
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mean = (P, idx) => {
  let x = 0, y = 0;
  for (const i of idx) { x += P[2 * i]; y += P[2 * i + 1]; }
  return [x / idx.length, y / idx.length];
};

/* 두 점 a1,a2 를 b1,b2 로 옮기는 닮음 변환(회전·크기·이동). 복소수 곱으로 푼다. */
function similarity(a1, a2, b1, b2) {
  const ax = a2[0] - a1[0], ay = a2[1] - a1[1], bx = b2[0] - b1[0], by = b2[1] - b1[1];
  const d = ax * ax + ay * ay;
  const sr = (bx * ax + by * ay) / d, si = (by * ax - bx * ay) / d;
  const fwd = (x, y) => [b1[0] + sr * (x - a1[0]) - si * (y - a1[1]), b1[1] + si * (x - a1[0]) + sr * (y - a1[1])];
  const k = sr * sr + si * si;
  const inv = (x, y) => {
    const dx = x - b1[0], dy = y - b1[1];
    return [a1[0] + (sr * dx + si * dy) / k, a1[1] + (-si * dx + sr * dy) / k];
  };
  return { fwd, inv };
}

/* 들로네 삼각분할 (Bowyer-Watson). 점 600개 남짓이라 단순한 방법으로 충분하다. */
function delaunay(pts) {
  const n = pts.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = pts.concat([[mx - d, my - d], [mx, my + d], [mx + d, my - d]]);
  const circ = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
    return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let tris = [[n, n + 1, n + 2, ...circ(n, n + 1, n + 2)]];
  for (let i = 0; i < n; i++) {
    const [x, y] = P[i];
    const bad = [], keep = [];
    for (const t of tris) ((x - t[3]) ** 2 + (y - t[4]) ** 2 < t[5] ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) {
      for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(k, edges.has(k) ? null : [a, b]);
      }
    }
    for (const e of edges.values()) if (e) keep.push([e[0], e[1], i, ...circ(e[0], e[1], i)]);
    tris = keep;
  }
  return tris.filter((t) => t[0] < n && t[1] < n && t[2] < n).map((t) => [t[0], t[1], t[2]]);
}

const inside = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// ─── 셰이더 ──────────────────────────────────────────────────────────────
const VS_ACC = `#version 300 es
in vec2 a_pos; in vec2 a_uv; in float a_w; in vec3 a_off;
uniform vec2 u_out;
out vec2 v_uv; out float v_w; out vec3 v_off;
void main() {
  v_uv = a_uv; v_w = a_w; v_off = a_off;
  gl_Position = vec4(a_pos.x / u_out.x * 2.0 - 1.0, 1.0 - a_pos.y / u_out.y * 2.0, 0.0, 1.0);
}`;
const FS_ACC = `#version 300 es
precision highp float;
in vec2 v_uv; in float v_w; in vec3 v_off;
uniform sampler2D u_tex; uniform float u_mul;
out vec4 o;
void main() {
  // 세부는 이 얼굴 것, 넓은 색은 윤곽 얼굴 쪽으로 (점마다 계산한 차이를 더한다)
  vec3 c = texture(u_tex, v_uv).rgb + v_off;
  float w = v_w * u_mul;
  o = vec4(clamp(c, 0.0, 1.0) * w, w);
}`;
const VS_QUAD = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
// 마지막 단계: 더한 색을 비율로 나누고, 빈자리(입안)를 채우고, 덜 맞춰졌으면 가로 띠를 어긋낸다
const FS_FINAL = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_acc; uniform vec2 u_out;
uniform vec2 u_mouth; uniform float u_mouthW; uniform float u_open;
uniform vec2 u_up[11]; uniform vec2 u_lo[11];
uniform float u_loose; uniform float u_time;
out vec4 o;
float hash(float n) { return fract(sin(n) * 43758.5453); }
// 입술 안쪽 선(11점)에서 x 자리의 높이
float lineY(vec2 L[11], float x) {
  if (x <= L[0].x) return L[0].y;
  for (int i = 0; i < 10; i++) {
    if (x <= L[i + 1].x) return mix(L[i].y, L[i + 1].y, (x - L[i].x) / max(0.001, L[i + 1].x - L[i].x));
  }
  return L[10].y;
}
void main() {
  vec2 uv = v_uv;
  float strip = floor((1.0 - uv.y) * 48.0);
  uv.x += (hash(strip * 12.9898 + floor(u_time * 6.0) * 78.233) - 0.5) * 0.22 * u_loose * u_loose;
  vec4 a = texture(u_acc, uv);
  vec3 face = a.rgb / max(a.a, 0.001);
  vec2 px = vec2(uv.x, 1.0 - uv.y) * u_out;
  float half_ = u_mouthW * 0.5;
  float dx = (px.x - u_mouth.x) / half_;
  float yUp = lineY(u_up, px.x), yLo = lineY(u_lo, px.x);
  float gap = max(1.0, yLo - yUp);
  float t = clamp((px.y - yUp) / gap, 0.0, 1.0);
  // 입안: 위는 어둡고, 아래는 혀 기운으로 조금 붉다. 입꼬리 쪽은 더 어둡다
  vec3 cavity = mix(vec3(0.07, 0.025, 0.03), vec3(0.36, 0.12, 0.13), smoothstep(0.45, 1.0, t) * smoothstep(0.25, 0.6, u_open));
  cavity *= 1.0 - 0.6 * smoothstep(0.4, 1.0, abs(dx));
  // 윗니: 윗입술 안쪽 선을 따라 내려온 띠
  float th = u_mouthW * 0.11;
  float ty = (px.y - yUp) / th;
  float side = 1.0 - smoothstep(0.5, 0.88, abs(dx));
  float upper = step(0.0, ty) * (1.0 - smoothstep(0.85, 1.0, ty)) * side;
  float seam = smoothstep(0.42, 0.5, abs(fract((px.x - u_mouth.x) / (u_mouthW * 0.105) + 0.5) - 0.5)) * (1.0 - 0.5 * abs(dx));
  vec3 enamel = vec3(0.93, 0.90, 0.84) * (0.72 + 0.28 * (1.0 - abs(dx)));
  enamel *= 1.0 - 0.25 * smoothstep(0.55, 1.0, ty) - 0.35 * (1.0 - smoothstep(0.0, 0.12, ty)) - 0.1 * seam;
  // 아랫니: 크게 벌렸을 때만 아랫입술 안쪽 위로 살짝
  float lty = (yLo - px.y) / (th * 0.7);
  float lower = step(0.0, lty) * (1.0 - smoothstep(0.7, 1.0, lty)) * side * smoothstep(0.45, 0.8, u_open);
  vec3 cav = mix(cavity, enamel, upper * smoothstep(0.05, 0.25, u_open));
  cav = mix(cav, enamel * 0.78, lower * (1.0 - upper));
  o = vec4(mix(cav, face, smoothstep(0.0, 0.85, a.a)), 1.0);
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ─── 엔진 ────────────────────────────────────────────────────────────────
export class Morph {
  constructor() {
    this.canvas = Object.assign(document.createElement("canvas"), { width: OUT_W, height: OUT_H });
    const gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error("이 브라우저는 WebGL2 를 쓸 수 없습니다");
    this.gl = gl;
    this.pAcc = program(gl, VS_ACC, FS_ACC);
    this.pFin = program(gl, VS_QUAD, FS_FINAL);
    this.faces = [];
    // 더하기용 틀. 8비트면 겹친 곳이 1 에서 잘리고 옅은 곳은 정밀도가 모자라 하얗게 튄다. 16비트 부동소수를 쓴다
    this.accTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.accTex);
    if (gl.getExtension("EXT_color_buffer_float")) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, OUT_W, OUT_H, 0, gl.RGBA, gl.HALF_FLOAT, null);
      this.precise = true;
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, OUT_W, OUT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  /* 얼굴 하나를 들인다. img 는 그림, pts 는 MediaPipe 랜드마크(0~1 비율) 478개. */
  addFace(img, landmarks) {
    const gl = this.gl;
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const P = new Float32Array(2 * N);
    for (let i = 0; i < N; i++) { P[2 * i] = landmarks[i].x * w; P[2 * i + 1] = landmarks[i].y * h; }
    // 두 눈 가운데를 기준 틀의 같은 자리로
    const eyeR = mean(P, R.RIGHT_EYE_UPPER.concat(R.RIGHT_EYE_LOWER));
    const eyeL = mean(P, R.LEFT_EYE_UPPER.concat(R.LEFT_EYE_LOWER));
    const T = similarity(eyeR, eyeL, [OUT_W * (0.5 - EYE_GAP / 2), OUT_H * EYE_LINE], [OUT_W * (0.5 + EYE_GAP / 2), OUT_H * EYE_LINE]);
    const Q = new Float32Array(2 * N);
    for (let i = 0; i < N; i++) [Q[2 * i], Q[2 * i + 1]] = T.fwd(P[2 * i], P[2 * i + 1]);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 사진 바깥을 읽으면 끝 줄이 늘어나 세로줄이 생긴다. 거울처럼 접어 읽는다
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    this.faces.push({ img, w, h, P, Q, T, tex, low: lowImage(img, P) });
  }

  /* 얼굴을 다 들인 뒤 한 번. 바깥 점을 더하고, 그물망과 부위 소속을 만든다. */
  build() {
    const K = this.faces.length;
    // 윤곽을 두 겹 넓힌 점 (머리카락과 목을 실어 나른다)
    for (const f of this.faces) {
      const c = mean(f.Q, R.FACE_OVAL);
      f.ring = [];
      // 화면 밖으로 나가면 테두리 점과 겹쳐 가는 선이 생긴다. 안쪽으로 묶는다
      const keep = (x, y) => [Math.min(OUT_W - 2, Math.max(2, x)), Math.min(OUT_H - 2, Math.max(2, y))];
      for (const s of [1.22, 1.5]) for (const i of R.FACE_OVAL) f.ring.push(keep(c[0] + (f.Q[2 * i] - c[0]) * s, c[1] + (f.Q[2 * i + 1] - c[1]) * s));
    }
    // 화면 테두리 점
    this.border = [];
    const B = 8;
    for (let i = 0; i < B; i++) {
      const t = i / B;
      this.border.push([t * OUT_W, 0], [OUT_W, t * OUT_H], [(1 - t) * OUT_W, OUT_H], [0, (1 - t) * OUT_H]);
    }
    this.V = N + this.faces[0].ring.length + this.border.length;
    // 얼굴마다 모든 점의 기준 틀 자리(Qx)와 사진 속 자리(uv)
    for (const f of this.faces) {
      f.QX = new Float32Array(2 * this.V);
      f.UV = new Float32Array(2 * this.V);
      const all = [];
      for (let i = 0; i < N; i++) all.push([f.Q[2 * i], f.Q[2 * i + 1]]);
      all.push(...f.ring, ...this.border);
      all.forEach(([x, y], v) => {
        f.QX[2 * v] = x; f.QX[2 * v + 1] = y;
        const [ix, iy] = v < N ? [f.P[2 * v], f.P[2 * v + 1]] : f.T.inv(x, y);
        f.UV[2 * v] = ix / f.w; f.UV[2 * v + 1] = iy / f.h;
      });
      // 점마다 이 얼굴의 넓은 색
      f.LOW = new Float32Array(3 * this.V);
      for (let v = 0; v < this.V; v++) f.LOW.set(sampleLow(f.low, f.UV[2 * v], f.UV[2 * v + 1]), 3 * v);
    }
    // 평균 모양으로 그물망
    const M = new Float32Array(2 * this.V);
    for (const f of this.faces) for (let i = 0; i < M.length; i++) M[i] += f.QX[i] / K;
    const pts = [];
    for (let v = 0; v < this.V; v++) pts.push([M[2 * v], M[2 * v + 1]]);
    // 입 안쪽 삼각형은 따로 둔다. 입을 다물면 사진의 입술 사이를 그대로 보이고, 벌리면 걷어 입안이 드러난다.
    // 다문 입으로 그물망을 짜면 윗입술과 아랫입술이 맞붙어 있어 입안 삼각형이 갈리지 않는다.
    // 그래서 짜기 전에만 아랫입술과 턱을 내려 입을 벌려 두고 짠다. 짠 모양(어느 점끼리 잇는지)만 쓴다.
    const lower = new Set([...R.LIPS_LOWER_OUTER, ...R.LIPS_LOWER_INNER]);
    [61, 291, 78, 308].forEach((i) => lower.delete(i));
    const mw = Math.hypot(pts[291][0] - pts[61][0], pts[291][1] - pts[61][1]);
    const mouthY = (pts[13][1] + pts[14][1]) / 2, chinY = pts[152][1];
    const opened = pts.map(([x, y], v) => {
      if (v >= N) return [x, y];
      if (lower.has(v)) return [x, y + mw * 0.35];
      if (y > mouthY + mw * 0.05 && y < chinY + mw * 0.3 && Math.abs(x - (pts[61][0] + pts[291][0]) / 2) < mw * 1.6) return [x, y + mw * 0.35 * Math.min(1, (y - mouthY) / (mw * 0.3))];
      return [x, y];
    });
    const lipHole = R.LIPS_INNER_LOOP.map((i) => opened[i]);
    const all = delaunay(opened);
    const inHole = ([a, b, c]) => inside((opened[a][0] + opened[b][0] + opened[c][0]) / 3, (opened[a][1] + opened[b][1] + opened[c][1]) / 3, lipHole);
    this.index = new Uint16Array(all.filter((t) => !inHole(t)).flat());
    this.holeIndex = new Uint16Array(all.filter(inHole).flat());
    this.mean = M;
    // 부위 소속. 그 부위 점에서 가까울수록 1, 멀어지면 0
    const regions = {
      eyes: [...R.RIGHT_EYE_UPPER, ...R.RIGHT_EYE_LOWER, ...R.LEFT_EYE_UPPER, ...R.LEFT_EYE_LOWER, ...R.RIGHT_IRIS, ...R.LEFT_IRIS, ...R.RIGHT_BROW, ...R.LEFT_BROW],
      nose: R.NOSE,
      mouth: [...R.LIPS_UPPER_OUTER, ...R.LIPS_LOWER_OUTER, ...R.LIPS_UPPER_INNER, ...R.LIPS_LOWER_INNER],
    };
    this.member = {};
    const near = REGION_NEAR * OUT_H, far = REGION_FAR * OUT_H;
    for (const [name, idx] of Object.entries(regions)) {
      const m = new Float32Array(this.V);
      for (let v = 0; v < this.V; v++) {
        let dmin = Infinity;
        for (const i of idx) dmin = Math.min(dmin, Math.hypot(M[2 * v] - M[2 * i], M[2 * v + 1] - M[2 * i + 1]));
        m[v] = 1 - smooth(near, far, dmin);
      }
      this.member[name] = m;
    }
    // 눈·코·입은 얼굴 윤곽 안쪽에서만 섞는다. 바깥까지 번지면 다른 얼굴의 피부가 머리카락 위에 비친다
    const oval = R.FACE_OVAL.map((i) => [M[2 * i], M[2 * i + 1]]);
    for (let v = 0; v < this.V; v++) {
      const x = M[2 * v], y = M[2 * v + 1];
      let dEdge = Infinity;
      for (let i = 0; i < oval.length; i++) {
        const [ax, ay] = oval[i], [bx, by] = oval[(i + 1) % oval.length];
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
        dEdge = Math.min(dEdge, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
      }
      const inFace = inside(x, y, oval) ? smooth(0, 0.035 * OUT_H, dEdge) : 0;
      for (const m of Object.values(this.member)) m[v] *= inFace;
    }
    const base = new Float32Array(this.V);
    for (let v = 0; v < this.V; v++) {
      let s = 0;
      for (const m of Object.values(this.member)) s += m[v];
      if (s > 1) for (const m of Object.values(this.member)) m[v] /= s;
      base[v] = Math.max(0, 1 - Math.min(1, s));
    }
    this.member.contour = base;
    // 그리기 준비
    const gl = this.gl;
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.index, gl.STATIC_DRAW);
    this.holeIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.holeIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.holeIndex, gl.STATIC_DRAW);
    this.posBuf = gl.createBuffer();
    this.wBuf = gl.createBuffer();
    this.offBuf = gl.createBuffer();
    this.OFF = new Float32Array(3 * this.V);
    this.REF = new Float32Array(3 * this.V);
    for (const f of this.faces) {
      f.uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, f.uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, f.UV, gl.STATIC_DRAW);
    }
    this.S = new Float32Array(2 * this.V);
    this.W = this.faces.map(() => new Float32Array(this.V));
  }

  get count() { return this.faces.length; }

  /* 부위마다 고른 얼굴 번호(소수면 두 얼굴을 섞는다)로 점마다 얼굴별 비율과 목표 모양을 만든다. */
  blend(sel) {
    const K = this.count;
    const pairs = {};
    for (const r of ["contour", "eyes", "nose", "mouth"]) {
      const x = Math.max(0, Math.min(K - 1, sel[r] ?? 0));
      const a = Math.floor(x), b = Math.min(K - 1, a + 1);
      let t = x - a;
      // 윤곽은 가운데에 덜 머물게 (S 자로 당긴다)
      if (r === "contour" && CONTOUR_SNAP > 0) {
        const e = 0.5 * CONTOUR_SNAP;
        t = e >= 0.499 ? (t < 0.5 ? 0 : 1) : t <= e ? 0 : t >= 1 - e ? 1 : smooth(e, 1 - e, t);
      }
      pairs[r] = [a, b, t];
    }
    for (const w of this.W) w.fill(0);
    this.S.fill(0);
    for (const [r, [a, b, t]] of Object.entries(pairs)) {
      const m = this.member[r];
      for (let v = 0; v < this.V; v++) {
        this.W[a][v] += m[v] * (1 - t);
        this.W[b][v] += m[v] * t;
      }
    }
    for (let k = 0; k < K; k++) {
      const w = this.W[k], Q = this.faces[k].QX;
      for (let v = 0; v < this.V; v++) {
        if (!w[v]) continue;
        this.S[2 * v] += Q[2 * v] * w[v];
        this.S[2 * v + 1] += Q[2 * v + 1] * w[v];
      }
    }
    // 넓은 색의 기준: 윤곽을 준 얼굴(들)의 넓은 색
    const [a, b, t] = pairs.contour;
    const la = this.faces[a].LOW, lb = this.faces[b].LOW;
    for (let i = 0; i < this.REF.length; i++) this.REF[i] = la[i] + (lb[i] - la[i]) * t;
  }

  /* 입·턱·눈꺼풀·고개를 목표 모양 위에서 움직인다. */
  animate({ open = 0, round = 0, spread = 0, blink = 0, tilt = 0, nod = 0 }) {
    const S = this.S;
    const at = (i) => [S[2 * i], S[2 * i + 1]];
    const cR = at(61), cL = at(291);
    const mouthW = Math.hypot(cL[0] - cR[0], cL[1] - cR[1]);
    const c = [(cR[0] + cL[0]) / 2, (cR[1] + cL[1]) / 2];
    const chinY = S[2 * 152 + 1];
    const jaw = open * mouthW * JAW_DROP;
    const upper = new Set([...R.LIPS_UPPER_OUTER, ...R.LIPS_UPPER_INNER]);
    const lowerLip = new Set([...R.LIPS_LOWER_OUTER, ...R.LIPS_LOWER_INNER]);
    const corners = new Set([61, 291, 78, 308]);
    for (let v = 0; v < N + 72; v++) {
      const x = S[2 * v] - c[0], y = S[2 * v + 1] - c[1];
      let dx = 0, dy = 0;
      if (corners.has(v)) {
        // 입꼬리는 제자리. 입안이 입꼬리 쪽으로 좁아진다
      } else if (lowerLip.has(v)) {
        // 아랫입술은 통째로 턱과 함께. 입꼬리에 가까울수록 덜
        dy += jaw * smooth(0, mouthW * 0.35, mouthW * 0.5 - Math.abs(x));
      } else if (upper.has(v)) {
        dy -= open * mouthW * 0.04 * smooth(0, mouthW * 0.3, mouthW * 0.5 - Math.abs(x));  // 윗입술이 살짝 들린다
      } else {
        // 아래턱: 입 아래와 턱은 많이, 귀 쪽과 목은 덜
        const below = smooth(mouthW * 0.02, mouthW * 0.25, y);
        const side = 1 - smooth(mouthW * 0.7, mouthW * 2.3, Math.abs(x));
        const neck = 1 - smooth(chinY - c[1] + mouthW * 0.25, chinY - c[1] + mouthW * 1.1, y);
        dy += jaw * below * side * neck;
      }
      // 입꼬리: 벌리면(이·에) 바깥으로, 모으면(우·오) 안으로
      for (const [cx, cy, sgn] of [[cR[0], cR[1], -1], [cL[0], cL[1], 1]]) {
        const near = 1 - smooth(0, mouthW * 0.38, Math.hypot(S[2 * v] - cx, S[2 * v + 1] - cy));
        dx += sgn * (spread * 0.1 - round * 0.16) * mouthW * near;
      }
      S[2 * v] += dx;
      S[2 * v + 1] += dy;
    }
    // 눈꺼풀
    if (blink > 0) {
      for (const [up, lo] of [[R.RIGHT_EYE_UPPER, R.RIGHT_EYE_LOWER], [R.LEFT_EYE_UPPER, R.LEFT_EYE_LOWER]]) {
        for (let j = 1; j < up.length - 1; j++) S[2 * up[j] + 1] += (S[2 * lo[j] + 1] - S[2 * up[j] + 1]) * blink * 0.92;
        for (const i of up === R.RIGHT_EYE_UPPER ? R.RIGHT_IRIS : R.LEFT_IRIS) S[2 * i + 1] += mouthW * 0.03 * blink;
      }
    }
    // 고개: 얼굴과 머리카락은 돌고, 화면 테두리는 그대로
    if (tilt || nod) {
      const o = mean(S, R.FACE_OVAL);
      const cs = Math.cos(tilt), sn = Math.sin(tilt);
      for (let v = 0; v < this.V - this.border.length; v++) {
        const x = S[2 * v] - o[0], y = S[2 * v + 1] - o[1];
        S[2 * v] = o[0] + x * cs - y * sn;
        S[2 * v + 1] = o[1] + x * sn + y * cs + nod;
      }
    }
    this.mouth = {
      c: at(13).map((v, i) => (v + at(14)[i]) / 2), w: mouthW, open,
      up: new Float32Array(R.LIPS_UPPER_INNER.flatMap((i) => at(i))),
      lo: new Float32Array(R.LIPS_LOWER_INNER.flatMap((i) => at(i))),
    };
  }

  /* 그린다. loose 가 크면 가로 띠가 어긋난다. */
  render(loose = 0, time = 0) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, OUT_W, OUT_H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pAcc);
    gl.uniform2f(gl.getUniformLocation(this.pAcc, "u_out"), OUT_W, OUT_H);
    const aPos = gl.getAttribLocation(this.pAcc, "a_pos"), aUv = gl.getAttribLocation(this.pAcc, "a_uv"), aW = gl.getAttribLocation(this.pAcc, "a_w");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.S, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const aOff = gl.getAttribLocation(this.pAcc, "a_off");
    this.faces.forEach((f, k) => {
      const w = this.W[k];
      let any = false;
      for (let v = 0; v < this.V; v++) if (w[v] > 0.002) { any = true; break; }
      if (!any) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, f.uvBuf);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.wBuf);
      gl.bufferData(gl.ARRAY_BUFFER, w, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aW);
      gl.vertexAttribPointer(aW, 1, gl.FLOAT, false, 0, 0);
      // 넓은 색 맞추기: 점마다 (기준 - 이 얼굴) 만큼 더한다
      for (let i = 0; i < this.OFF.length; i++) this.OFF[i] = (this.REF[i] - f.LOW[i]) * COLOR_MATCH;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.offBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.OFF, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aOff);
      gl.vertexAttribPointer(aOff, 3, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f.tex);
      gl.uniform1i(gl.getUniformLocation(this.pAcc, "u_tex"), 0);
      gl.uniform1f(gl.getUniformLocation(this.pAcc, "u_mul"), 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.drawElements(gl.TRIANGLES, this.index.length, gl.UNSIGNED_SHORT, 0);
      // 입 안쪽: 다물수록 사진 그대로, 벌릴수록 걷힌다
      const keep = 1 - smooth(0.02, 0.18, this.mouth ? this.mouth.open : 0);
      if (keep > 0.01 && this.holeIndex.length) {
        gl.uniform1f(gl.getUniformLocation(this.pAcc, "u_mul"), keep);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.holeIbo);
        gl.drawElements(gl.TRIANGLES, this.holeIndex.length, gl.UNSIGNED_SHORT, 0);
      }
    });
    gl.disable(gl.BLEND);
    // 마지막 단계
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, OUT_W, OUT_H);
    gl.useProgram(this.pFin);
    const u = (n) => gl.getUniformLocation(this.pFin, n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accTex);
    gl.uniform1i(u("u_acc"), 0);
    gl.uniform2f(u("u_out"), OUT_W, OUT_H);
    const m = this.mouth || { c: [0, 0], w: 1, open: 0, up: new Float32Array(22), lo: new Float32Array(22) };
    gl.uniform2f(u("u_mouth"), m.c[0], m.c[1]);
    gl.uniform1f(u("u_mouthW"), m.w);
    gl.uniform1f(u("u_open"), m.open);
    gl.uniform2fv(u("u_up"), m.up);
    gl.uniform2fv(u("u_lo"), m.lo);
    gl.uniform1f(u("u_loose"), loose);
    gl.uniform1f(u("u_time"), time);
    const aQ = gl.getAttribLocation(this.pFin, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(aQ);
    gl.vertexAttribPointer(aQ, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

/* 「넓은 색」: 피부만 흐리게 평균낸 색. 머리카락·눈·눈썹·입술은 빼고 잰다(정규화 합성곱).
   그래야 눈 옆 머리카락의 어두움이 피부색으로 잘못 옮겨 가지 않는다. */
function lowImage(img, P) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const w = COLOR_BLUR, h = Math.round((w * ih) / iw);
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  const pix = g.getImageData(0, 0, w, h).data;
  // 피부 자리: 윤곽 안, 눈·눈썹·입술 밖
  g.clearRect(0, 0, w, h);
  const path = (idx) => {
    g.beginPath();
    idx.forEach((i, k) => (k ? g.lineTo : g.moveTo).call(g, (P[2 * i] / iw) * w, (P[2 * i + 1] / ih) * h));
    g.closePath();
  };
  g.fillStyle = "#fff";
  path(R.FACE_OVAL); g.fill();
  g.fillStyle = "#000";
  for (const loop of [
    [...R.RIGHT_EYE_UPPER, ...R.RIGHT_EYE_LOWER.slice().reverse()], [...R.LEFT_EYE_UPPER, ...R.LEFT_EYE_LOWER.slice().reverse()],
    [...R.LIPS_UPPER_OUTER, ...R.LIPS_LOWER_OUTER.slice().reverse()],
  ]) { path(loop); g.lineWidth = w * 0.03; g.stroke(); g.fill(); }
  for (const brow of [R.RIGHT_BROW, R.LEFT_BROW]) { path(brow); g.lineWidth = w * 0.03; g.stroke(); g.fill(); }
  const msk = g.getImageData(0, 0, w, h).data;
  const n = w * h, acc = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], wt = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = msk[4 * i] / 255;
    wt[i] = m;
    for (let k = 0; k < 3; k++) acc[k][i] = (pix[4 * i + k] / 255) * m;
  }
  const r = Math.max(1, Math.round(w * 0.06));
  for (const arr of [...acc, wt]) { blur(arr, w, h, r); blur(arr, w, h, r); }
  // 피부가 없는 자리(머리카락·배경)는 피부 전체 평균으로 채운다. 그 자리는 어차피 윤곽 얼굴만 쓴다
  let sw = 0; const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) { const m = msk[4 * i] / 255; sw += m; for (let k = 0; k < 3; k++) mean[k] += (pix[4 * i + k] / 255) * m; }
  for (let k = 0; k < 3; k++) mean[k] /= Math.max(1, sw);
  const d = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, wt[i] / 0.15);
    for (let k = 0; k < 3; k++) d[4 * i + k] = (wt[i] > 1e-4 ? acc[k][i] / wt[i] : mean[k]) * t + mean[k] * (1 - t);
  }
  return { w, h, d, scale: 1 };
}

function blur(a, w, h, r) {
  const t = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; c++; } }
    t[y * w + x] = s / c;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; c++; } }
    a[y * w + x] = s / c;
  }
}

/* 줄인 사진에서 (u, v) 자리의 색을 고르게 읽는다 (쌍선형). */
function sampleLow(low, u, v) {
  const x = Math.min(low.w - 1.001, Math.max(0, u * low.w - 0.5)), y = Math.min(low.h - 1.001, Math.max(0, v * low.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const px = (xx, yy, k) => low.d[(yy * low.w + xx) * 4 + k];
  return [0, 1, 2].map((k) =>
    px(x0, y0, k) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, k) * fx * (1 - fy) + px(x0, y0 + 1, k) * (1 - fx) * fy + px(x0 + 1, y0 + 1, k) * fx * fy);
}
