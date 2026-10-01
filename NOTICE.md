# NOTICE · 제3자 구성요소

이 저장소의 코드는 [LICENSE](LICENSE) 를 따릅니다. 아래 것들은 각 원저작자의 라이선스를 그대로 따릅니다.

## 코드에 포함한 것

없습니다. 제3자 코드를 이 저장소에 넣지 않았습니다. 소리 분석과 화면은 브라우저에 들어 있는 기능
(Web Audio, Canvas, BroadcastChannel)만 쓰고, 합성 음성은 운영체제의 음성을 씁니다.

## 실행할 때 설치하는 것 (environment.yml)

| 대상 | 쓰는 곳 | 라이선스 |
|---|---|---|
| Python (conda-forge) | 웹 서버, 내려받기 | PSF License |
| Miniforge (conda 가 없을 때만 `~/miniforge3` 에 깐다) | conda 환경 | BSD-3-Clause |

## 따로 받아 쓰는 것

| 대상 | 출처 | 라이선스 | 비고 |
|---|---|---|---|
| 시험용 녹음 (`web/sample/목소리.flac`) | https://commons.wikimedia.org/wiki/File:Ko_Colijn_voice_-_nl.flac | **CC0 1.0** (Vera de Kok) | 저장소에 넣지 않는다. 설치 스크립트가 받고 출처를 `web/sample/credits.md` 에 적는다 |

## 글

`web/script.js` 의 읽을 문장은 자리를 채우려고 넣은 윤동주의 「서시」입니다(퍼블릭 도메인).
선으로 그린 기본 얼굴은 `web/face.js` 가 그때그때 그리는 것이라 제3자 저작물이 아닙니다.
