import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * 聊天附图约束 — 与 ai-service M0 契约对齐:
 * attachments 上限 4 张, 单张解码后 ≤ 2MB, 仅 jpeg/png/webp 的 base64 data URI
 */
export const CHAT_IMAGE_MAX_COUNT = 4;
export const CHAT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const DATA_URI_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

/** 返回 data URI 的 mime 类型, 非法则返回 null */
export function imageDataUriMime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = DATA_URI_PATTERN.exec(value);
  return match ? match[1] : null;
}

/** data URI 解码后的字节数(按 padding 精确计算, 大小校验要走边界) */
export function imageDataUriBytes(value: string): number {
  const base64 = value.slice(value.indexOf(',') + 1).replace(/\s/g, '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(((base64.length - padding) * 3) / 4);
}

export function isValidChatImageDataUri(value: unknown): value is string {
  if (!imageDataUriMime(value)) return false;
  const bytes = imageDataUriBytes(value as string);
  return bytes > 0 && bytes <= CHAT_IMAGE_MAX_BYTES;
}

/** 单张聊天附图校验(class-validator, 配合 each: true 用在数组字段上) */
export function IsChatImageDataUri(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isChatImageDataUri',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: unknown) {
          return isValidChatImageDataUri(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} 每一项必须是 jpeg/png/webp 的 base64 data URI, 且解码后不超过 ${
            CHAT_IMAGE_MAX_BYTES / 1024 / 1024
          }MB`;
        },
      },
    });
  };
}
