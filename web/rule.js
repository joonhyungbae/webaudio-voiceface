/*
 결정. 목소리의 무엇이 얼굴의 무엇을 바꾸는가.

 이 파일이 작품의 규칙이다. 아래 연결은 출발점으로 정해 둔 예시다. 줄을 바꾸고, 지우고,
 새로 이어 보면서 「내 목소리라서 이 얼굴이 나왔다」고 느껴지는 연결을 찾는 것이 할 일이다.

 들어오는 것  s     낭독 전체를 모은 숫자 (voice.js 의 summary: level, pitch, pitchVar, rate, pause, rhythm, seconds)
             live  지금 이 순간의 숫자 (level, voiced, pitchN)
             p     조작 화면 조절판의 값
             n     얼굴 은행에 있는 얼굴 수
 나가는 것
   contour  윤곽과 머리를 가져올 얼굴 번호. 0 ~ n-1 사이 소수면 두 얼굴을 섞는다
   eyes     눈 띠를 가져올 얼굴 번호
   nose     코 띠를 가져올 얼굴 번호
   mouth    입 띠를 가져올 얼굴 번호
   tilt     고개 기울기 (라디안)
   formed   얼굴이 맞춰진 정도 0~1. 낮으면 띠들이 어긋나 흔들린다
*/

const pick = (v, n) => Math.max(0, Math.min(n - 1, v * (n - 1)));

export function compose(s, live, p, n) {
  return {
    // 낮은 목소리일수록 앞쪽 얼굴, 높은 목소리일수록 뒤쪽 얼굴의 윤곽
    contour: pick(s.pitch, n),

    // 빨리 읽을수록 뒤쪽 얼굴의 눈
    eyes: pick(s.rate, n),

    // 높낮이가 많이 오르내릴수록 뒤쪽 얼굴의 코
    nose: pick(s.pitchVar, n),

    // 크게 읽을수록 뒤쪽 얼굴의 입. 멈춤이 많으면 조금 앞으로 당긴다
    mouth: pick(Math.max(0, s.level * 1.4 - s.pause * 0.3), n),

    // 평균보다 높게 말하는 순간 고개가 살짝 든다
    tilt: (live.pitchN - s.pitch) * 0.12 * p.tiltGain,

    // 말한 시간이 쌓일수록 얼굴이 맞춰진다. 고르게 읽으면 조금 더 빨리 맞춰진다
    formed: Math.min(1, (s.seconds / p.formSeconds) * (0.8 + 0.4 * s.rhythm)),
  };
}
