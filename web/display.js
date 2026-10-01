/*
 전시 화면. 조작 화면이 보내는 상태를 받아 그리기만 한다. 목소리는 오지 않는다.

 외부 모니터에 이 창을 띄우고 클릭하거나 F 를 누르면 전체 화면이 된다.
 조작 화면이 꺼져 있으면 기다림 장면을 그린다.
*/

import { PARAMS } from "./settings.js";
import { FaceBank, FaceRenderer } from "./face.js";
import { drawScene } from "./session.js";

const cv = document.getElementById("screen");
const g = cv.getContext("2d");
const bank = new FaceBank();
let renderer;
let msg = { stage: "idle", t: 0, p: Object.fromEntries(PARAMS.map((d) => [d.key, d.value])) };
let heard = 0;
let colors = "";

async function ensureBank(p) {
  const key = p.ink + p.paper;
  if (key === colors) return;
  colors = key;
  await bank.load(p.ink, p.paper);
  renderer = new FaceRenderer(bank);
}

if ("BroadcastChannel" in window) {
  new BroadcastChannel("voiceface").onmessage = (e) => { msg = e.data; heard = performance.now(); };
}

function loop(nowMs) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  // 세로 화면을 꽉 채운다. 가로로 넓은 창이면 가운데 9:16 만 쓴다
  const h = innerHeight, w = Math.min(innerWidth, Math.floor(h * 9 / 16));
  if (cv.width !== Math.floor(w * dpr)) {
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  }
  const quiet = nowMs - heard > 2000;
  const m = quiet ? { ...msg, stage: "idle" } : msg;
  ensureBank(m.p).then(() => renderer && drawScene(g, cv.width, cv.height, m, renderer, nowMs / 1000));
  requestAnimationFrame(loop);
}

addEventListener("click", () => document.documentElement.requestFullscreen?.());
addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.(); });
try { navigator.wakeLock?.request("screen"); } catch {}
requestAnimationFrame(loop);
