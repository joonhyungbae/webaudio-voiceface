/*
 체험 한 번의 순서. 조작 화면이 이것을 돌리고, 매 프레임 상태를 전시 화면에 보낸다.

   idle      기다림. 은행의 얼굴 조각과 안내 글
   intro     안내와 동의. 시작을 누르면 낭독으로
   reading   한 줄씩 읽는다. 말이 끝나고 조용하면 다음 줄로. 얼굴이 조금씩 맞춰진다
   replay    녹음을 다시 튼다. 얼굴이 그 목소리로 말한다 (조절판에서 끌 수 있다)
   disperse  얼굴이 조각으로 흩어지고 마지막 문장이 남는다
   erased    녹음을 지웠다고 알린다. 잠시 뒤 idle

 어디서든 reset() 을 부르면 녹음을 지우고 idle 로 돌아간다.
*/

import { SCRIPT } from "./script.js";
import { compose } from "./rule.js";
import { analyze, at } from "./lipsync.js";
import { text } from "./face.js";
import { LINE_READ_RATIO, LINE_READ_PAUSE } from "./settings.js";

// 줄에서 소리 나는 글자 수. 한글·영문·숫자만 센다
const syllables = (line) => (line.match(/[가-힣a-zA-Z0-9]/g) || []).length;

const scaleMouth = (m, g) => ({ open: Math.min(1, m.open * g), round: m.round, spread: m.spread });

const EMPTY = { level: 0, pitch: 0.5, pitchVar: 0, rate: 0, pause: 0, rhythm: 0.5, seconds: 0 };

export class Session {
  constructor(voice, bank, p) {
    this.voice = voice;
    this.bank = bank;
    this.p = p;
    this.stage = "idle";
    this.t = 0;              // 이 단계에 들어온 뒤 흐른 시간
    this.line = 0;
    this.sum = { ...EMPTY };
    this.comp = compose(EMPTY, this.voice.live, p, bank.count);
    this.input = "mic";
    this.spokeInLine = false;
    this.silence = 0;
    this.onChange = null;
    voice.onEnded = () => this.inputEnded();
  }

  go(stage) {
    this.stage = stage;
    this.t = 0;
    this.onChange?.(stage);
  }

  intro() { if (this.stage === "idle") this.go("intro"); }

  /* 낭독 시작. input 은 mic · file · synth · watch(보기만) */
  async start(input, opts = {}) {
    this.input = input;
    this.line = 0;
    this.spokeInLine = false;
    this.silence = 0;
    this.lineOnsets = 0;
    this.sum = { ...EMPTY };
    this.go("reading");
    try {
      if (input === "mic") await this.voice.startMic(opts.deviceId);
      else if (input === "file" || input === "watch") await this.voice.startFile(opts.sample);
      else if (input === "synth") this.voice.startSynth(SCRIPT.lines, (i) => { this.line = i; if (i) this.voice.markLine(); });
    } catch (e) {
      this.error = String(e.message || e);
      this.reset();
    }
  }

  /* 다음 줄. 마지막 줄 다음이면 낭독을 끝낸다. 파일·합성 낭독은 소리가 끝날 때까지 줄만 넘긴다. */
  next() {
    if (this.stage === "idle") return this.intro();
    if (this.stage !== "reading") return;
    if (this.line < SCRIPT.lines.length - 1) {
      this.line++;
      this.voice.markLine();
      this.spokeInLine = false;
      this.silence = 0;
      this.lineOnsets = this.voice.tally.onsets;
    } else if (this.input === "mic") {
      this.finishReading();
    }
  }

  inputEnded() {
    if (this.stage === "reading") this.finishReading();
    else if (this.stage === "replay") this.go("disperse");
  }

  async finishReading() {
    if (this.stage !== "reading") return;
    this.sum = this.voice.summary();
    this.stage = "finishing";
    const wasSynth = this.input === "synth";
    await this.voice.stopInput();
    // 녹음 전체에서 입 모양을 뽑는다. 다시 듣기 때 얼굴이 이것으로 말한다
    this.track = this.voice.recording && !wasSynth ? analyze(this.voice.recording) : null;
    if (wasSynth) this.voice.mode = "synth";
    if (this.p.replay && this.voice.replay(SCRIPT.lines, (i) => (this.line = i))) this.go("replay");
    else this.go("disperse");
  }

  /* 녹음을 지우고 처음으로. */
  reset() {
    this.voice.erase();
    this.track = null;
    this.sum = { ...EMPTY };
    this.go(this.stage === "idle" || this.stage === "intro" ? "idle" : "erased");
  }

  tick(dt, renderer) {
    this.t += dt;
    const collect = this.stage === "reading";
    const live = this.voice.read(dt, collect);
    const s = collect ? this.voice.summary() : this.sum;

    if (this.stage === "reading" && this.input === "mic") {
      // 그 줄을 거의 다 읽고 잠깐 쉬거나, 말한 뒤 오래 조용하면 다음 줄로
      if (live.voiced) { this.spokeInLine = true; this.silence = 0; }
      else this.silence += dt;
      const read = this.voice.tally.onsets - this.lineOnsets;
      const enough = read >= syllables(SCRIPT.lines[this.line]) * LINE_READ_RATIO;
      if (this.spokeInLine && ((enough && this.silence > LINE_READ_PAUSE) || this.silence > this.p.lineSilence)) this.next();
    }
    if (this.stage === "reading" && this.input !== "mic" && this.input !== "synth") {
      // 녹음 파일은 문장 수만큼 고르게 나눠 자막을 넘긴다
      const dur = this.voice.recording?.duration || 1;
      const want = Math.min(SCRIPT.lines.length - 1, Math.floor((this.voice.now - this.voice.t0) / (dur / SCRIPT.lines.length)));
      while (this.line < want) { this.line++; this.voice.markLine(); }
    }
    if (this.stage === "replay") {
      // 다시 들을 때는 읽을 때 넘긴 시각대로 자막을 맞춘다
      const at = this.voice.now - this.voice.t0;
      const times = this.voice.lineTimes;
      let i = 0;
      while (i + 1 < times.length && times[i + 1] <= at) i++;
      if (this.input !== "synth") this.line = i;
    }
    if (this.stage === "disperse" && this.t > this.p.disperseSeconds) {
      this.voice.erase();
      this.track = null;
      this.go("erased");
    }
    if (this.stage === "erased" && this.t > 2.5) this.go("idle");

    this.comp = compose(s, live, this.p, this.bank.count);
    if (this.stage === "replay") {
      this.comp.formed = 1;
      if (this.track) Object.assign(this.comp, scaleMouth(at(this.track, this.voice.now - this.voice.t0), this.p.mouthGain));
    }
    return { s, live };
  }

  /* 전시 화면에 보낼 상태. 목소리 자체는 보내지 않는다. 숫자만 간다. */
  message() {
    return { stage: this.stage, t: this.t, comp: this.comp, line: this.line, p: this.p };
  }
}

/* 상태 하나를 그린다. 조작 화면의 미리보기와 전시 화면이 같은 함수를 쓴다. */
export function drawScene(g, cw, ch, msg, renderer, now) {
  const p = msg.p;
  g.fillStyle = p.paper;
  g.fillRect(0, 0, cw, ch);
  const caption = (str) => {
    if (!p.captions || !str) return;
    text(g, str, cw / 2, ch * 0.93, cw * 0.9, ch * 0.032, p.ink);
  };
  switch (msg.stage) {
    case "idle":
      renderer.drawIdle(g, cw, ch, now, SCRIPT.idle, p);
      break;
    case "intro":
      SCRIPT.intro.forEach((l, i) => text(g, l, cw / 2, ch * (0.38 + i * 0.1), cw * 0.82, ch * 0.033, p.ink));
      break;
    case "reading":
    case "finishing":
    case "replay":
      renderer.compose(msg.comp, now);
      renderer.drawFace(g, cw, ch);
      caption(SCRIPT.lines[msg.line]);
      break;
    case "disperse":
      if (!renderer.tiles || msg.t < 0.05) { renderer.compose({ ...msg.comp, open: 0 }, now); renderer.startDisperse(); }
      renderer.drawDisperse(g, cw, ch, msg.t, p.disperseSeconds, SCRIPT.final, p);
      break;
    case "erased":
      renderer.tiles = null;
      text(g, SCRIPT.erased, cw / 2, ch * 0.5, cw * 0.8, ch * 0.03, p.ink);
      break;
  }
}
