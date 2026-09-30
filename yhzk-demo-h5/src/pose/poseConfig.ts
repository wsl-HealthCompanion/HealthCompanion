export const MEDIAPIPE_WASM_ROOT =
  import.meta.env.VITE_MEDIAPIPE_WASM_ROOT
  || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

export const POSE_LANDMARKER_MODEL_URL =
  import.meta.env.VITE_POSE_LANDMARKER_MODEL_URL
  || 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const REQUIRED_POSE_LANDMARKS = [
  { index: 11, key: 'left_shoulder', label: '左肩' },
  { index: 12, key: 'right_shoulder', label: '右肩' },
  { index: 13, key: 'left_elbow', label: '左肘' },
  { index: 14, key: 'right_elbow', label: '右肘' },
  { index: 15, key: 'left_wrist', label: '左腕' },
  { index: 16, key: 'right_wrist', label: '右腕' },
  { index: 23, key: 'left_hip', label: '左髋' },
  { index: 24, key: 'right_hip', label: '右髋' },
] as const;
