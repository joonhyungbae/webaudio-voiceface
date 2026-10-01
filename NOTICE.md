# NOTICE · 제3자 구성요소

이 저장소의 코드는 [LICENSE](LICENSE) 를 따릅니다. 아래 것들은 각 원저작자의 라이선스를 그대로 따릅니다.

## 코드에 포함한 것

| 경로 | 출처 | 원저작자 | 라이선스 | 수정 여부 |
|---|---|---|---|---|
| `web/vendor/mediapipe/vision_bundle.mjs` | https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs | Google | **Apache-2.0** | 수정 없음 |
| `web/vendor/mediapipe/wasm/vision_wasm_internal.js`, `.wasm` | https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/ | Google | **Apache-2.0** | 수정 없음 |
| `web/regions.js` 의 점 번호 | mediapipe 0.10.14 `face_mesh_connections.py` | Google | **Apache-2.0** | 번호만 옮겨 적음 |

전시장에서 인터넷이 끊겨도 돌도록 CDN 대신 파일을 넣어 두었습니다.

## 예제 얼굴 (말하는 영상)

얼굴 은행 `web/faces/NN.mp4` 는 가상 인물의 말하는 영상입니다. 실존 인물을 찍거나 본뜬 것이 아닙니다.
먼저 `tools/make_faces.py` 로 APIFrame 의 FLUX.2 Pro(Black Forest Labs)에서 인물 사진을 만들고, 그 사진을 첫 프레임 삼아
`tools/make_videos.py` 로 APIFrame 의 Hailuo 02(MiniMax)에서 영상을 만들었습니다. 영상, 랜드마크(`NN.lm.json`), 사진은
저장소에 넣지 않고 릴리스(faces-v1)에 올려 두었으며, 설치할 때 영상과 랜드마크를 받습니다. 이 저장소에서는 CC0 로 내놓습니다.

## 실행할 때 설치하는 것 (environment.yml)

| 대상 | 쓰는 곳 | 라이선스 |
|---|---|---|
| Python (conda-forge) | 웹 서버, 내려받기 | PSF License |
| Miniforge (conda 가 없을 때만 `~/miniforge3` 에 깐다) | conda 환경 | BSD-3-Clause |
| FFmpeg (conda-forge) | `tools/make_videos.py` 가 영상을 다시 인코딩할 때만 | LGPL-2.1 이상 (conda-forge 빌드는 GPL 구성요소 포함) |

## 따로 받아 쓰는 것

| 대상 | 출처 | 라이선스 | 비고 |
|---|---|---|---|
| MediaPipe Face Landmarker 모델 (`web/models/face_landmarker.task`) | https://storage.googleapis.com/mediapipe-models/ | Apache-2.0 | 저장소에 넣지 않는다. 설치 스크립트가 받는다. 설치 없이 보는 주소에는 배포할 때 받아 올린다 |
| 시험용 녹음 (`web/sample/목소리.flac`) | https://commons.wikimedia.org/wiki/File:Ko_Colijn_voice_-_nl.flac | **CC0 1.0** (Vera de Kok) | 저장소에 넣지 않는다. 설치 스크립트가 받고 출처를 `web/sample/credits.md` 에 적는다 |
| APIFrame (`tools/make_faces.py` 만) | https://apiframe.ai | 유료 API | 전시에는 쓰지 않는다. 쓰는 사람의 키로 부르고, 키는 저장소에 두지 않는다 |

## 글

`web/script.js` 의 읽을 문장은 자리를 채우려고 넣은 윤동주의 「서시」입니다(퍼블릭 도메인).
