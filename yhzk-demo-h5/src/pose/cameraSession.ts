import type { CameraStatus } from './types';

export interface CameraSessionDeps {
  getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user' },
  audio: false,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isPermissionDenied(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError';
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export class CameraSession {
  private readonly deps: CameraSessionDeps;
  private status: CameraStatus = 'idle';
  private stream: MediaStream | null = null;
  private error = '';
  private pendingStart: Promise<MediaStream> | null = null;
  private generation = 0;

  constructor(deps: Partial<CameraSessionDeps> = {}) {
    this.deps = {
      getUserMedia: deps.getUserMedia ?? ((constraints) => {
        return navigator.mediaDevices.getUserMedia(constraints);
      }),
    };
  }

  getStatus(): CameraStatus {
    return this.status;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getError(): string {
    return this.error;
  }

  start(): Promise<MediaStream> {
    if (this.stream) {
      return Promise.resolve(this.stream);
    }
    if (this.pendingStart) {
      return this.pendingStart;
    }

    const generation = this.generation;
    this.status = 'requesting';
    this.error = '';

    const pending = this.deps.getUserMedia(CAMERA_CONSTRAINTS)
      .then((stream) => {
        if (generation !== this.generation) {
          stopTracks(stream);
          throw new Error('Camera start cancelled');
        }

        this.stream = stream;
        this.status = 'active';
        return stream;
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) {
          throw error;
        }

        this.stream = null;
        this.status = isPermissionDenied(error) ? 'denied' : 'error';
        this.error = errorMessage(error);
        throw error;
      })
      .finally(() => {
        if (this.pendingStart === pending) {
          this.pendingStart = null;
        }
      });

    this.pendingStart = pending;
    return pending;
  }

  stop(): void {
    this.generation += 1;
    this.pendingStart = null;

    const stream = this.stream;
    this.stream = null;

    if (stream) {
      stopTracks(stream);
    }

    this.status = 'idle';
    this.error = '';
  }
}
