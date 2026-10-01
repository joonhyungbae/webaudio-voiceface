/*
 입력. 목소리를 숫자로 바꾼다.

 들어오는 길은 셋이다.
   마이크      관객이 직접 읽는다. 읽는 동안 이 브라우저의 메모리에만 녹음한다
   음성 파일   시험용 녹음을 관객의 목소리처럼 흘려 넣는다 (--sim)
   합성 음성   운영체제의 음성 합성이 대신 읽는다. 직접 읽기 어려운 관객을 위한 길이다

 매 프레임 내보내는 것 (read)
   level   지금 소리의 크기 0~1
   voiced  지금 말하고 있는가
   pitchN  지금 높낮이 0~1 (말하지 않으면 직전 값)

 낭독 전체를 모아 내보내는 것 (summary)
   level     평균 크기
   pitch     평균 높낮이
   pitchVar  높낮이가 오르내린 폭
   rate      빠르기 (초당 음절 수를 0~1 로)
   pause     멈춤이 차지한 비율
   rhythm    음절 간격이 고른 정도 (1 이면 일정하다)
   seconds   말한 시간(초). 얼굴이 맞춰지는 정도에 쓴다

 녹음은 파일로 남기지 않는다. erase() 를 부르면 메모리에서도 버린다.
*/

import {
  LEVEL_FLOOR_DB, LEVEL_RANGE_DB, PITCH_LOW_HZ, PITCH_HIGH_HZ,
  SYLLABLES_PER_SEC, PAUSE_MIN_SEC, PITCH_SPREAD_ST, NOISE_MARGIN, FLOOR_RISE,
} from "./settings.js";

const PROMINENCE = 0.06;  // 음절 봉우리로 볼 크기 차이
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const semis = (hz) => 12 * Math.log2(hz / 440);
const LOW_ST = semis(PITCH_LOW_HZ);
const HIGH_ST = semis(PITCH_HIGH_HZ);

/* 높낮이 찾기. YIN 의 누적 평균 정규화 차이를 쓴다. 계산을 줄이려고 반으로 솎아서 본다. */
function detectPitch(buf, sampleRate) {
  const half = new Float32Array(buf.length >> 1);
  for (let i = 0; i < half.length; i++) half[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5;
  const sr = sampleRate / 2;
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.min(Math.floor(sr / 70), half.length - 2);
  const n = half.length - maxLag;
  if (n < 64) return 0;
  let running = 0;
  let prev = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let i = 0; i < n; i++) {
      const x = half[i] - half[i + lag];
      d += x * x;
    }
    running += d;
    const cm = running > 0 ? (d * lag) / running : 1;
    // 문턱 아래로 내려갔다가 다시 오르기 시작하는 첫 자리가 주기다
    if (lag > minLag && prev < 0.15 && cm > prev) return sr / (lag - 1);
    prev = cm;
  }
  return 0;
}

class Tally {
  constructor() { this.reset(); }
  reset() {
    this.n = 0; this.sumLevel = 0;
    this.pn = 0; this.sumSt = 0; this.sumSt2 = 0;
    this.voicedTime = 0; this.first = -1; this.last = -1;
    this.onsets = 0; this.lastOnset = -1; this.iois = [];
    this.pauseTime = 0; this.silentSince = -1;
    this.high = false; this.low = null; this.peak = 0;
  }
  add(t, dt, level, voiced, f0) {
    if (voiced) {
      if (this.first < 0) this.first = t;
      // 말을 다시 시작했다. 그 사이 침묵이 길었으면 멈춤 하나로 센다
      if (this.silentSince >= 0 && this.first !== t) {
        const gap = t - this.silentSince;
        if (gap >= PAUSE_MIN_SEC) this.pauseTime += gap;
      }
      this.silentSince = -1;
      this.last = t;
      this.voicedTime += dt;
      this.n++;
      this.sumLevel += level;
      if (f0 > 0) {
        const st = semis(f0);
        this.pn++; this.sumSt += st; this.sumSt2 += st * st;
      }
    } else if (this.silentSince < 0 && this.first >= 0) {
      this.silentSince = t;
    }
    // 음절: 소리 크기의 봉우리 하나. 직전 골짜기보다 PROMINENCE 만큼 솟으면 하나로 센다
    if (!this.high) {
      this.low = Math.min(this.low ?? level, level);
      if (voiced && level - this.low > PROMINENCE) {
        this.high = true;
        this.peak = level;
        if (this.lastOnset < 0 || t - this.lastOnset > 0.08) {
          if (this.lastOnset >= 0 && t - this.lastOnset < 1.0) this.iois.push(t - this.lastOnset);
          this.onsets++;
          this.lastOnset = t;
        }
      }
    } else {
      this.peak = Math.max(this.peak, level);
      if (this.peak - level > PROMINENCE) { this.high = false; this.low = level; }
    }
  }
  summary() {
    const span = this.last > this.first ? this.last - this.first : 0;
    const meanSt = this.pn ? this.sumSt / this.pn : LOW_ST;
    const varSt = this.pn ? Math.max(0, this.sumSt2 / this.pn - meanSt * meanSt) : 0;
    const speaking = Math.max(0.5, span - this.pauseTime);
    let rhythm = 0.5;
    if (this.iois.length > 3) {
      const m = this.iois.reduce((a, b) => a + b, 0) / this.iois.length;
      const sd = Math.sqrt(this.iois.reduce((a, b) => a + (b - m) ** 2, 0) / this.iois.length);
      rhythm = clamp(1 - sd / m);
    }
    return {
      level: this.n ? this.sumLevel / this.n : 0,
      pitch: clamp((meanSt - LOW_ST) / (HIGH_ST - LOW_ST)),
      pitchVar: clamp(Math.sqrt(varSt) / PITCH_SPREAD_ST),
      rate: clamp(this.onsets / speaking / SYLLABLES_PER_SEC),
      pause: span > 0 ? clamp(this.pauseTime / span) : 0,
      rhythm,
      seconds: this.voicedTime,
    };
  }
}

export class Voice {
  constructor() {
    this.ctx = null;
    this.tally = new Tally();
    this.live = { level: 0, voiced: false, pitchN: 0.5, f0: 0 };
    this.recording = null;    // AudioBuffer. 녹음 전체
    this.lineTimes = [];      // 줄이 바뀐 시각(녹음 시작 기준 초)
    this.mode = "none";       // mic · file · synth · replay
    this.synthLevel = 0;
    this.threshold = 0.22;
    this.floor = 1;  // 처음 들어온 소리로 바로 내려온다
    this.onEnded = null;      // 파일·합성 낭독이 끝나면 부른다
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    // 분석으로 가는 입구. 마이크·파일·다시 듣기가 모두 여기로 들어온다
    this.analyser = this.ctx.createGain();
    this.win = new Float32Array(2048);
    // 녹화(--offline)할 때 소리도 담으려고 갈래 하나를 둔다
    this.tap = this.ctx.createMediaStreamDestination();
    this.ready = this.ctx.audioWorklet.addModule("tap.js").then(() => {
      const node = new AudioWorkletNode(this.ctx, "voiceface-tap");
      node.port.onmessage = (e) => this.onBlock(e.data);
      this.analyser.connect(node);
      // 출력 없이 두면 멈추는 브라우저가 있어 소리 없는 길로 이어 둔다
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(this.ctx.destination);
    });
  }

  async resume() {
    this.ensure();
    await this.ready;
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  /* 1024 샘플이 들어올 때마다. 창이 가려져도 소리가 흐르는 한 불린다. */
  onBlock(block) {
    if (this.mode === "none" || this.mode === "synth") return;
    this.win.copyWithin(0, block.length);
    this.win.set(block, this.win.length - block.length);
    let s = 0;
    for (let i = 0; i < block.length; i++) s += block[i] * block[i];
    const db = 10 * Math.log10(s / block.length + 1e-12);
    const level = clamp((db - LEVEL_FLOOR_DB) / LEVEL_RANGE_DB);
    let f0 = level > this.gate ? detectPitch(this.win, this.ctx.sampleRate) : 0;
    this.update(level, f0, block.length / this.ctx.sampleRate);
  }

  /* 실제 문턱. 방의 바닥 소음 위로 NOISE_MARGIN, 그래도 조절판의 문턱보다는 낮지 않게. */
  get gate() { return Math.max(this.threshold, this.floor + NOISE_MARGIN); }

  update(level, f0, dt) {
    // 바닥 소음 짐작: 조용해지면 바로 내려가고, 시끄러워지면 천천히 오른다(말소리를 소음으로 착각하지 않게)
    this.floor = level < this.floor ? level : Math.min(level, this.floor + FLOOR_RISE * dt);
    const voiced = level > this.gate;
    // 사람 목소리 범위 밖의 높낮이는 잘못 잡은 것으로 본다
    if (f0 && (f0 < 70 || f0 > 500)) f0 = 0;
    const pitchN = f0 ? clamp((semis(f0) - LOW_ST) / (HIGH_ST - LOW_ST)) : this.live.pitchN;
    this.live = { level, voiced, pitchN, f0 };
    if (this.collect) this.tally.add(this.now, dt, level, voiced, f0);
  }

  get now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  /* 마이크로 읽기 시작. 잡음 제거·자동 크기 조절을 끈다. 목소리의 크기와 결이 그대로 숫자가 되어야 한다. */
  async startMic(deviceId) {
    await this.resume();
    this.stopInput(true);
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(500);
    this.begin("mic");
  }

  /* 녹음 파일을 관객의 목소리처럼 흘려 넣는다. 스피커로도 들린다. */
  async startFile(url) {
    await this.resume();
    this.stopInput(true);
    const data = await (await fetch(url)).arrayBuffer();
    this.recording = await this.ctx.decodeAudioData(data);
    this.playBuffer(this.recording, "file");
  }

  /* 운영체제의 음성 합성이 줄마다 읽는다. 소리를 직접 잴 수 없어서, 단어가 나올 때마다 크기를 만들어 낸다. */
  startSynth(lines, onLine) {
    this.stopInput(true);
    this.ensure();
    this.begin("synth");
    const say = (i) => {
      if (this.mode !== "synth") return;
      if (i >= lines.length) { this.onEnded?.(); return; }
      onLine?.(i);
      const u = new SpeechSynthesisUtterance(lines[i]);
      u.lang = "ko-KR";
      u.rate = 0.9;
      u.onboundary = () => { this.synthLevel = 0.85; };
      u.onend = () => setTimeout(() => say(i + 1), 500);
      speechSynthesis.speak(u);
    };
    speechSynthesis.cancel();
    say(0);
  }

  begin(mode) {
    this.mode = mode;
    this.floor = 1;  // 처음 들어온 소리로 바로 내려온다
    this.tally.reset();
    this.lineTimes = [0];
    this.t0 = this.now;
  }

  markLine() { this.lineTimes.push(this.now - this.t0); }

  playBuffer(buffer, mode) {
    this.ensure();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    src.connect(this.ctx.destination);
    src.connect(this.tap);
    src.onended = () => { if (this.player === src) { this.player = null; this.onEnded?.(); } };
    this.player = src;
    src.start();
    if (mode === "file") this.begin("file");
    else { this.mode = mode; this.t0 = this.now; }
  }

  /* 낭독을 멈춘다. 마이크였으면 녹음을 버퍼로 바꿔 둔다(다시 듣기용). */
  async stopInput(silent = false) {
    if (this.mode === "synth") speechSynthesis.cancel();
    if (this.player) { const p = this.player; this.player = null; try { p.stop(); } catch {} }
    this.live = { ...this.live, level: 0, voiced: false };
    if (this.recorder && this.recorder.state !== "inactive") {
      const done = new Promise((r) => (this.recorder.onstop = r));
      this.recorder.stop();
      await done;
      if (!silent && this.chunks.length) {
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
        try { this.recording = await this.ctx.decodeAudioData(await blob.arrayBuffer()); } catch { this.recording = null; }
      }
      this.chunks = [];
    }
    this.recorder = null;
    // 마이크를 바로 놓는다. 다음 관객 차례까지 켜 두지 않는다
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    if (silent) this.mode = "none";
  }

  /* 녹음을 처음부터 다시 튼다. 끝나면 onEnded. */
  replay(lines, onLine) {
    if (this.mode === "synth" || !this.recording) {
      // 합성 음성이었으면 다시 읽힌다
      if (lines && this.mode === "synth") { this.startSynth(lines, onLine); return true; }
      return false;
    }
    this.playBuffer(this.recording, "replay");
    return true;
  }

  /* 녹음과 숫자를 모두 버린다. */
  erase() {
    this.stopInput(true);
    speechSynthesis.cancel();
    this.recording = null;
    this.chunks = [];
    this.lineTimes = [];
    this.tally.reset();
    this.mode = "none";
  }

  /* 한 프레임. 합성 음성은 여기서 크기를 만들고, 나머지는 onBlock 이 이미 잰 값을 돌려준다. */
  read(dt, collect) {
    this.collect = collect;
    if (this.mode === "synth") {
      this.synthLevel *= Math.pow(0.02, dt);  // 단어마다 솟았다가 금방 가라앉는다
      const level = this.synthLevel;
      this.update(level, level > this.gate ? 210 + 30 * Math.sin(this.now * 3) : 0, dt);
    } else if (this.mode === "none") {
      this.live = { ...this.live, level: 0, voiced: false };
    }
    return this.live;
  }

  summary() { return this.tally.summary(); }

  async microphones() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput");
  }
}
