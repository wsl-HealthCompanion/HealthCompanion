import { describe, expect, it, vi } from 'vitest';
import {
  addImageToChips,
  capturePhotoDataUri,
  MAX_CHAT_IMAGES,
  resolveFrameSize,
} from './frameCapture';

describe('resolveFrameSize — 等比缩放', () => {
  it('长边缩到 768, 保持宽高比', () => {
    expect(resolveFrameSize(1920, 1080)).toEqual({ width: 768, height: 432 });
    expect(resolveFrameSize(1080, 1920)).toEqual({ width: 432, height: 768 });
  });

  it('小于长边不放大', () => {
    expect(resolveFrameSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('无有效尺寸原样返回', () => {
    expect(resolveFrameSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('addImageToChips — 附图上限与去重', () => {
  it('null/undefined 原样返回', () => {
    const cur = ['a'];
    expect(addImageToChips(cur, null)).toBe(cur);
  });

  it('重复图片不追加', () => {
    expect(addImageToChips(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('达到上限不再追加', () => {
    const full = Array.from({ length: MAX_CHAT_IMAGES }, (_, i) => `img_${i}`);
    expect(addImageToChips(full, 'new')).toBe(full);
  });

  it('正常追加', () => {
    expect(addImageToChips(['a'], 'b')).toEqual(['a', 'b']);
  });
});

describe('capturePhotoDataUri — 截帧编排', () => {
  function makeDeps() {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const video: any = {
      muted: false,
      srcObject: null,
      videoWidth: 1920,
      videoHeight: 1080,
      play: vi.fn(async () => {}),
    };
    const drawImage = vi.fn();
    const canvas: any = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,FAKE'),
    };
    const getUserMedia = vi.fn(async () => stream);
    const deps = {
      getUserMedia,
      createVideo: () => video,
      createCanvas: () => canvas,
    };
    return { deps, video, canvas, drawImage, stop, getUserMedia };
  }

  it('截帧 → 压缩 → 释放相机, 全链路成功', async () => {
    const { deps, video, canvas, drawImage, stop, getUserMedia } = makeDeps();

    const pending = capturePhotoDataUri(deps);
    await Promise.resolve();           // flush: getUserMedia 已 resolve
    expect(video.onloadedmetadata).toBeTypeOf('function');
    video.onloadedmetadata();          // 模拟 meta 加载完成
    const dataUri = await pending;

    expect(dataUri).toBe('data:image/jpeg;base64,FAKE');
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });
    expect(video.play).toHaveBeenCalled();
    expect(canvas.width).toBe(768);    // 1920x1080 → 长边 768
    expect(canvas.height).toBe(432);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 768, 432);
    expect(stop).toHaveBeenCalled();   // finally 里释放相机
    expect(video.srcObject).toBeNull();
  });

  it('getUserMedia 失败时抛错且不泄漏轨道', async () => {
    const { deps, stop } = makeDeps();
    (deps.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NotAllowedError'));
    await expect(capturePhotoDataUri(deps)).rejects.toThrow('NotAllowedError');
    expect(stop).not.toHaveBeenCalled(); // 流没拿到, 无轨道可释放
  });
});
