import { validate } from 'class-validator';
import { SendMessageDto } from './chat.dto';
import {
  CHAT_IMAGE_MAX_BYTES,
  isValidChatImageDataUri,
  imageDataUriMime,
} from './validators/chat-image.validator';

/** 生成合法 data URI: 指定 mime + 指定解码字节数 */
function makeDataUri(mime = 'image/jpeg', bytes = 1024): string {
  // base64 每 4 字符表示 3 字节
  const base64 = Buffer.alloc(bytes).toString('base64');
  return `data:${mime};base64,${base64}`;
}

describe('聊天附图 data URI 校验', () => {
  it('接受 jpeg/png/webp 的 base64 data URI', () => {
    expect(isValidChatImageDataUri(makeDataUri('image/jpeg'))).toBe(true);
    expect(isValidChatImageDataUri(makeDataUri('image/png'))).toBe(true);
    expect(isValidChatImageDataUri(makeDataUri('image/webp'))).toBe(true);
  });

  it('拒绝非白名单 mime 与非 data URI', () => {
    expect(isValidChatImageDataUri(makeDataUri('image/gif'))).toBe(false);
    expect(isValidChatImageDataUri(makeDataUri('image/svg+xml'))).toBe(false);
    expect(isValidChatImageDataUri('https://example.com/a.jpg')).toBe(false);
    expect(isValidChatImageDataUri('data:image/jpeg;base64,')).toBe(false);
    expect(isValidChatImageDataUri('')).toBe(false);
    expect(isValidChatImageDataUri(123 as any)).toBe(false);
    expect(isValidChatImageDataUri(null)).toBe(false);
  });

  it('拒绝解码后超过 2MB 的图片', () => {
    const oversized = makeDataUri('image/jpeg', CHAT_IMAGE_MAX_BYTES + 1);
    expect(isValidChatImageDataUri(oversized)).toBe(false);
    const exact = makeDataUri('image/jpeg', CHAT_IMAGE_MAX_BYTES);
    expect(isValidChatImageDataUri(exact)).toBe(true);
  });

  it('imageDataUriMime 提取 mime', () => {
    expect(imageDataUriMime(makeDataUri('image/png'))).toBe('image/png');
    expect(imageDataUriMime('not-a-data-uri')).toBeNull();
  });
});

describe('SendMessageDto images 字段校验', () => {
  const base = { message: '看看我这在做什么' };

  async function validateWith(images: unknown) {
    const dto = Object.assign(new SendMessageDto(), base, { images });
    return validate(dto);
  }

  it('不带 images 完全兼容旧请求', async () => {
    const dto = Object.assign(new SendMessageDto(), base);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('最多 4 张合法图片通过', async () => {
    const images = Array.from({ length: 4 }, () => makeDataUri());
    expect(await validateWith(images)).toHaveLength(0);
  });

  it('超过 4 张被拒绝', async () => {
    const images = Array.from({ length: 5 }, () => makeDataUri());
    const errors = await validateWith(images);
    expect(errors.some((e) => e.constraints?.arrayMaxSize)).toBe(true);
  });

  it('数组里有非法项被拒绝', async () => {
    const errors = await validateWith([makeDataUri(), 'data:image/gif;base64,AAAA']);
    expect(errors.some((e) => e.constraints?.isChatImageDataUri)).toBe(true);
  });

  it('非数组被拒绝', async () => {
    const errors = await validateWith('data:image/jpeg;base64,AAAA');
    expect(errors.some((e) => e.constraints?.isArray)).toBe(true);
  });
});
