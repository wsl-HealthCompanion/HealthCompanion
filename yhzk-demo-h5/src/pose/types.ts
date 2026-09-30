export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'error';

export interface PoseLandmarkPoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestampMs: number;
  landmarks: PoseLandmarkPoint[];
  worldLandmarks?: PoseLandmarkPoint[];
  inferenceMs: number;
}
