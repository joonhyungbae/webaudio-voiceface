/*
 MediaPipe 얼굴 메시(478점)에서 부위마다의 점 번호. 손으로 고칠 일은 없다.
 mediapipe 0.10.14 의 face_mesh_connections.py 에서 뽑았다. 「왼쪽·오른쪽」은 찍힌 사람 기준이다.
*/

export const LIPS_UPPER_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
export const LIPS_LOWER_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
export const LIPS_UPPER_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
export const LIPS_LOWER_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
export const LIPS_INNER_LOOP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

export const RIGHT_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const RIGHT_EYE_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133];
export const LEFT_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const LEFT_EYE_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362];
export const RIGHT_IRIS = [469, 470, 471, 472];
export const LEFT_IRIS = [474, 475, 476, 477];

export const RIGHT_BROW = [46, 52, 53, 55, 63, 65, 66, 70, 105, 107];
export const LEFT_BROW = [276, 282, 283, 285, 293, 295, 296, 300, 334, 336];
export const NOSE = [1, 2, 4, 5, 6, 19, 45, 48, 64, 94, 97, 98, 115, 168, 195, 197, 220, 275, 278, 294, 326, 327, 344, 440];
export const FACE_OVAL = [10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338];  // 이마 가운데(10)에서 시작해 한 바퀴
