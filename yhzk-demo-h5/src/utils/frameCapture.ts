// ============================================================
// 拍照问一问 — 摄像头截帧 → 压缩 data URI
// 与后端契约对齐: jpeg data URI, 长边≤768px, 质量0.8, 最多4张
// (后端 DTO 校验张数/单张≤2MB, ai-service 校验 attachments)
// ============================================================

export interface FrameSize {
  width: number;
  height: number;
}

/** 等比缩放到长边 maxEdge, 只缩小不放大 */
export function resolveFrameSize(videoW: number, videoH: number, maxEdge = 768): FrameSize {
  const longest = Math.max(videoW, videoH);
  if (!videoW || !videoH || longest <= maxEdge) return { width: videoW, height: videoH };
  const scale = maxEdge / longest;
  return { width: Math.round(videoW * scale), height: Math.round(videoH * scale) };
}

export interface FrameCaptureDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createVideo: () => HTMLVideoElement;
  createCanvas: () => HTMLCanvasElement;
}

const defaultDeps: FrameCaptureDeps = {
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  createVideo: () => document.createElement('video'),
  createCanvas: () => document.createElement('canvas'),
};

/**
 * 开摄像头拍一张, 返回压缩后的 jpeg data URI。
 * 相机临时开启, 截完立刻释放; 若调用方已有活跃相机流, 也走独立短暂会话, 不干扰现有画面。
 */
export async function capturePhotoDataUri(
  deps: Partial<FrameCaptureDeps> = {},
  maxEdge = 768,
  quality = 0.8,
): Promise<string> {
  const d = { ...defaultDeps, ...deps };
  const stream = await d.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  const video = d.createVideo();
  video.srcObject = stream;
  video.muted = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('摄像头画面加载失败'));
    });
    await video.play();
    const { width, height } = resolveFrameSize(video.videoWidth, video.videoHeight, maxEdge);
    const canvas = d.createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 Canvas 截图');
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    video.srcObject = null;
    for (const track of stream.getTracks()) track.stop();
  }
}

/** 附图 chips 上限 — 与后端 SendMessageDto.images 校验一致 */
export const MAX_CHAT_IMAGES = 4;

/** chips 追加: 去重 + 上限, 非法输入原样返回 */
export function addImageToChips(current: string[], dataUri: string | null, max = MAX_CHAT_IMAGES): string[] {
  if (!dataUri || current.includes(dataUri) || current.length >= max) return current;
  return [...current, dataUri];
}
