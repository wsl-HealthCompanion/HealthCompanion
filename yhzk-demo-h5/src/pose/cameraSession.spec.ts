import { describe, expect, it, vi } from 'vitest';
import { CameraSession } from './cameraSession';

function fakeTrack() {
  return {
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe('CameraSession', () => {
  it('does not request camera access until start is called', () => {
    const getUserMedia = vi.fn();
    const session = new CameraSession({ getUserMedia });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(session.getStatus()).toBe('idle');
    expect(session.getStream()).toBeNull();
  });

  it('requests user-facing video without audio and exposes the active stream', async () => {
    const stream = fakeStream([fakeTrack()]);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const session = new CameraSession({ getUserMedia });

    await expect(session.start()).resolves.toBe(stream);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: false,
    });
    expect(session.getStatus()).toBe('active');
    expect(session.getStream()).toBe(stream);
    expect(session.getError()).toBe('');
  });

  it('deduplicates simultaneous starts while permission is pending', async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const getUserMedia = vi.fn().mockReturnValue(pending);
    const session = new CameraSession({ getUserMedia });

    const first = session.start();
    const second = session.start();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toBe('requesting');

    const stream = fakeStream([fakeTrack()]);
    resolveStream(stream);

    await expect(first).resolves.toBe(stream);
    await expect(second).resolves.toBe(stream);
  });

  it('returns the existing active stream without requesting permission again', async () => {
    const stream = fakeStream([fakeTrack()]);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const session = new CameraSession({ getUserMedia });

    await session.start();
    await expect(session.start()).resolves.toBe(stream);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('classifies camera permission rejection as denied', async () => {
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    const session = new CameraSession({ getUserMedia });

    await expect(session.start()).rejects.toBe(denied);

    expect(session.getStatus()).toBe('denied');
    expect(session.getStream()).toBeNull();
    expect(session.getError()).toMatch(/permission denied/i);
  });

  it('classifies other camera failures as error', async () => {
    const failure = new Error('camera unavailable');
    const getUserMedia = vi.fn().mockRejectedValue(failure);
    const session = new CameraSession({ getUserMedia });

    await expect(session.start()).rejects.toBe(failure);

    expect(session.getStatus()).toBe('error');
    expect(session.getStream()).toBeNull();
    expect(session.getError()).toBe('camera unavailable');
  });

  it('stops every track, clears state, and is idempotent', async () => {
    const firstTrack = fakeTrack();
    const secondTrack = fakeTrack();
    const stream = fakeStream([firstTrack, secondTrack]);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const session = new CameraSession({ getUserMedia });

    await session.start();
    session.stop();
    session.stop();

    expect(firstTrack.stop).toHaveBeenCalledTimes(1);
    expect(secondTrack.stop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toBe('idle');
    expect(session.getStream()).toBeNull();
    expect(session.getError()).toBe('');
  });
});
