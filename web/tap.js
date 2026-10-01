/*
 오디오 스레드에서 도는 작은 갈래. 들어온 소리를 1024 샘플씩 모아 화면 쪽(voice.js)에 보낸다.

 화면 그리기는 창이 뒤로 가면 브라우저가 멈추지만, 소리는 계속 흐른다. 분석을 소리 쪽에 묶어 두면
 조작 창을 가려도 목소리를 빠짐없이 센다.
*/
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1024);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("voiceface-tap", Tap);
