import axios from 'axios';
import { AiClientService, imagesToAttachments } from './ai-client.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const configStub = { get: (_key: string, defaultValue?: any) => defaultValue } as any;

function makeDataUri(mime = 'image/jpeg', bytes = 128): string {
  return `data:${mime};base64,${Buffer.alloc(bytes).toString('base64')}`;
}

describe('imagesToAttachments — H5 images[] → ai-service attachments[]', () => {
  it('undefined/空数组 → 空数组', () => {
    expect(imagesToAttachments(undefined)).toEqual([]);
    expect(imagesToAttachments([])).toEqual([]);
  });

  it('data URI → { kind:"image", mime, data(原样 data URI) }', () => {
    const png = makeDataUri('image/png');
    const jpeg = makeDataUri('image/jpeg');
    expect(imagesToAttachments([png, jpeg])).toEqual([
      { kind: 'image', mime: 'image/png', data: png },
      { kind: 'image', mime: 'image/jpeg', data: jpeg },
    ]);
  });

  it('M0 契约字段名一字不差: kind/mime/data', () => {
    const [first] = imagesToAttachments([makeDataUri('image/webp')]);
    expect(Object.keys(first).sort()).toEqual(['data', 'kind', 'mime']);
    expect(first.kind).toBe('image');
  });
});

describe('AiClientService.streamChat — 请求体对齐 M0 契约', () => {
  afterEach(() => jest.clearAllMocks());

  function client() {
    return new AiClientService(configStub);
  }

  function stubStream() {
    // response.data 只需可 for-await(空可迭代即可), 不关心事件内容
    mockedAxios.post.mockResolvedValue({ data: [] } as any);
  }

  it('不带 attachments 时请求体不含该字段(向后兼容)', async () => {
    stubStream();
    const svc = client();
    for await (const _ of svc.streamChat({
      user_message: '你好',
      user_context: {},
      conversation_history: [],
      scene_mode: 'day',
    })) {
      // no events
    }
    const body = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('attachments');
    expect(body.user_message).toBe('你好');
  });

  it('带 images 时请求体携带 attachments', async () => {
    stubStream();
    const svc = client();
    const attachments = imagesToAttachments([makeDataUri()]);
    for await (const _ of svc.streamChat({
      user_message: '这是什么',
      user_context: {},
      conversation_history: [],
      scene_mode: 'day',
      attachments,
    })) {
      // no events
    }
    const body = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.attachments).toEqual(attachments);
    expect((body.attachments as any[])[0].kind).toBe('image');
  });

  it('attachments 为空数组时不携带该字段', async () => {
    stubStream();
    const svc = client();
    for await (const _ of svc.streamChat({
      user_message: '你好',
      user_context: {},
      conversation_history: [],
      scene_mode: 'day',
      attachments: [],
    })) {
      // no events
    }
    const body = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('attachments');
  });
});
