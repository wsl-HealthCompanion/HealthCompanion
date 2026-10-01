export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'error';

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

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
  imageSize?: { width: number; height: number };
  inferenceMs: number;
}
