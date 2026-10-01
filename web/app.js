/*
 조작 화면. 목소리를 받고, 체험 순서를 돌리고, 전시 화면에 상태를 보낸다.

 주소 뒤에 붙여 쓰는 것
   ?sim          마이크 대신 시험용 녹음(sample/목소리.flac)을 관객의 목소리로 쓴다
   ?auto         체험을 끝없이 되풀이한다 (시험·전시 시연용)
   ?offline=20   시험용 녹음으로 한 바퀴 돌며 20초를 녹화해 서버에 보낸다 (./start.sh --offline 20)
*/

import { PARAMS, SEND_HZ } from "./settings.js";
import { SCRIPT } from "./script.js";
import { Voice } from "./voice.js";
import { FaceBank, FaceRenderer } from "./face.js";
import { Session, drawScene } from "./session.js";

const $ = (id) => document.getElementById(id);
const url = new URLSearchParams(location.search);
const SAMPLE = "sample/목소리.flac";
const offline = Number(url.get("offline") || 0);
const sim = url.has("sim") || offline > 0;
const auto = url.has("auto") || offline > 0;

// ─── 조절판 값. 브라우저에 남기되, settings.js 의 처음 값이 바뀌면 버린다 ───
const STORE = "voiceface.params.v1";
const DEFAULTS = Object.fromEntries(PARAMS.map((d) => [d.key, d.value]));
const p = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved && JSON.stringify(saved.defaults) === JSON.stringify(DEFAULTS)) Object.assign(p, saved.values);
} catch {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ defaults: DEFAULTS, values: p })); } catch {} };

const voice = new Voice();
const bank = new FaceBank();
let renderer, session;

function buildParams() {
  const box = $("params");
  box.innerHTML = "";
  for (const d of PARAMS) {
    const row = document.createElement("label");
    row.className = "param";
    const input = document.createElement("input");
    if (d.type === "check") { input.type = "checkbox"; input.checked = !!p[d.key]; }
    else if (d.type === "color") { input.type = "color"; input.value = p[d.key]; }
    else { input.type = "range"; Object.assign(input, { min: d.min, max: d.max, step: d.step }); input.value = p[d.key]; }
    const out = document.createElement("output");
    const show = () => (out.textContent = d.type ? "" : Number(p[d.key]).toFixed(d.step < 1 ? 2 : 0));
    input.addEventListener("input", async () => {
      p[d.key] = d.type === "check" ? input.checked : d.type ? input.value : Number(input.value);
      show();
      save();
      voice.threshold = p.voiceThreshold;
    });
    show();
    row.append(Object.assign(document.createElement("span"), { textContent: d.label }), input, out);
    box.append(row);
  }
}

const SUM = [["level", "크기"], ["pitch", "높낮이"], ["pitchVar", "높낮이 변화"], ["rate", "빠르기"], ["pause", "멈춤"], ["rhythm", "고른 리듬"]];
const COMP = ["contour", "eyes", "nose", "mouth", "open", "formed"];
function buildMeters() {
  $("summary").innerHTML = SUM.map(([k, t]) => `<div class="meter"><span>${t}</span><i><b id="m-${k}"></b></i><output id="v-${k}"></output></div>`).join("");
  $("comp").innerHTML = COMP.map((k) => `<span>${k} <b id="c-${k}">0</b></span>`).join("");
}

const STAGE_NAME = { idle: "기다림", intro: "안내", reading: "낭독", finishing: "낭독", preparing: "말할 준비", replay: "다시 듣기", disperse: "흩어짐", erased: "지움" };

async function listMics() {
  try {
    const mics = await voice.microphones();
    const sel = $("mic");
    const keep = sel.value;
    sel.innerHTML = "";
    mics.forEach((m, i) => sel.add(new Option(m.label || `마이크 ${i + 1}`, m.deviceId)));
    if (keep) sel.value = keep;
  } catch {}
}

function startWith(input) {
  voice.resume();
  const opts = { deviceId: $("mic").value || null, sample: SAMPLE };
  if (input === "mic" && sim) input = "file";
  session.start(input, opts).then(() => { if (input === "mic") listMics(); });
}

function wire() {
  $("b-intro").onclick = () => session.intro();
  $("b-read").onclick = () => startWith("mic");
  $("b-synth").onclick = () => startWith("synth");
  $("b-watch").onclick = () => startWith("watch");
  $("b-next").onclick = () => session.next();
  $("b-reset").onclick = () => session.reset();
  $("b-display").onclick = () => window.open("display.html", "voiceface-display", "width=540,height=960");
  $("b-reset-params").onclick = () => { Object.assign(p, DEFAULTS); save(); buildParams(); };
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === " ") { e.preventDefault(); session.stage === "intro" ? startWith("mic") : session.next(); }
    if (e.key === "Escape") session.reset();
    if (e.key.toLowerCase() === "h") document.body.classList.toggle("bare");
  });
}

// ─── --offline: 시험용 녹음으로 한 바퀴 돌며 미리보기 화면과 소리를 녹화해 서버로 보낸다 ───
function recordOffline(seconds) {
  const type = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
  const stream = $("preview").captureStream(30);
  voice.ensure();
  voice.tap.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: type });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    const ext = type.includes("mp4") ? "mp4" : "webm";
    await fetch(`/save?ext=${ext}`, { method: "POST", body: new Blob(chunks, { type }) }).catch(() => {});
    $("status").textContent = `out.${ext} 로 적었습니다`;
  };
  rec.start(1000);
  setTimeout(() => rec.stop(), seconds * 1000);
}

// ─── 한 프레임 ───
const channel = "BroadcastChannel" in window ? new BroadcastChannel("voiceface") : null;
const prev = $("preview");
const pg = prev.getContext("2d");
let last = performance.now();
let sent = 0;

function loop(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  const now = nowMs / 1000;
  voice.threshold = p.voiceThreshold;
  const { s, live } = session.tick(dt, renderer);
  const msg = session.message();

  // 미리보기는 화면 크기에 맞춰 9:16 으로
  const box = $("stage").getBoundingClientRect();
  const h = Math.floor(Math.min(box.height, box.width * 16 / 9));
  const w = Math.floor(h * 9 / 16);
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (prev.width !== w * dpr) { prev.width = w * dpr; prev.height = h * dpr; prev.style.width = `${w}px`; prev.style.height = `${h}px`; }
  drawScene(pg, prev.width, prev.height, msg, renderer, now);

  if (channel && nowMs - sent > 1000 / SEND_HZ) { channel.postMessage(msg); sent = nowMs; }

  if (!document.body.classList.contains("bare")) {
    $("stage-name").textContent = STAGE_NAME[session.stage] + (session.stage === "reading" ? ` · ${session.line + 1}/${SCRIPT.lines.length}줄` : "");
    $("level").style.width = `${live.level * 100}%`;
    $("level").classList.toggle("on", live.voiced);
    $("level-mark").style.left = `${voice.gate * 100}%`;
    $("pitch-now").textContent = live.f0 ? `${Math.round(live.f0)}Hz` : "";
    for (const [k] of SUM) { $(`m-${k}`).style.width = `${s[k] * 100}%`; $(`v-${k}`).textContent = s[k].toFixed(2); }
    for (const k of COMP) $(`c-${k}`).textContent = session.comp[k].toFixed(2);
    $("seconds").textContent = `말한 시간 ${s.seconds.toFixed(1)}초`;
    if (session.error) { $("status").textContent = `열지 못했습니다: ${session.error}`; session.error = null; }
    if (session.note) $("status").textContent = session.note;
  }

  // 되풀이: 기다림 → 안내 → 낭독
  if (auto && session.stage === "idle" && session.t > 2) session.intro();
  if (auto && session.stage === "intro" && session.t > 2) startWith(sim ? "file" : "mic");

  requestAnimationFrame(loop);
}

// ─── 시작 ───
(async () => {
  buildParams();
  buildMeters();
  wire();
  try {
    await bank.load((t) => ($("status").textContent = t));
  } catch (e) {
    $("status").textContent = `얼굴을 읽지 못했습니다: ${e.message || e}`;
    return;
  }
  renderer = new FaceRenderer(bank);
  session = new Session(voice, bank, p);
  session.onChange = (stage) => { if (stage === "idle") $("status").textContent = `얼굴: ${bank.source}${sim ? " · 시험용 녹음" : ""}`; };
  $("status").textContent = `얼굴: ${bank.source}${sim ? " · 시험용 녹음으로 읽습니다" : ""}`;
  listMics();
  if (offline) recordOffline(offline);
  // 관객을 기다리는 동안 말하는 영상들을 미리 훑어 둔다
  renderer.scanAll();
  requestAnimationFrame(loop);
  try { navigator.wakeLock?.request("screen"); } catch {}
  window.voiceface = { p, voice, session };
})();
