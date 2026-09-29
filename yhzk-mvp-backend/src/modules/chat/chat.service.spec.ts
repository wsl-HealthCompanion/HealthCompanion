import { ChatService } from './chat.service';

function createPythonAiService() {
  const service = Object.create(ChatService.prototype) as any;
  const events = async function* () {
    yield { type: 'token', content: '回答内容' };
    yield { type: 'citation', source: '指南.pdf', text: '参考片段' };
    yield { type: 'done', sessionId: 'session-1', emotion: 'neutral', intent: 'health_question' };
  };
  service.logger = { warn: jest.fn(), error: jest.fn() };
  service.loadSessionMemories = jest.fn().mockResolvedValue([]);
  service.aiClient = { streamChat: jest.fn(() => events()) };
  service.ttsService = {
    synthesize: jest.fn().mockResolvedValue({ audioUrl: 'audio.mp3', visemeTimeline: [], durationSec: 1 }),
  };
  service.saveMessage = jest.fn().mockResolvedValue(undefined);
  service.sessionRepo = { save: jest.fn().mockResolvedValue(undefined) };
  service.triggerMemorySummary = jest.fn().mockResolvedValue(undefined);
  service.updateSessionContext = jest.fn().mockResolvedValue(undefined);
  service.getSceneMode = jest.fn().mockReturnValue('default');
  return service;
}

async function collect(generator: AsyncGenerator<unknown>) {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('ChatService Python streaming', () => {
  const session = { session_id: 'session-1', message_count: 0, last_active: new Date() } as any;

  it('skips redundant server TTS when the H5 client already speaks the stream', async () => {
    const service = createPythonAiService();

    const events = await collect(service.processPythonAI(
      'user-1', session, '问题', 'text', {}, [], true,
    ));

    expect(service.ttsService.synthesize).not.toHaveBeenCalled();
    expect(events.some((event: any) => event.type === 'audio' || event.type === 'visemes')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'done', sessionId: 'session-1' });
  });

  it('keeps citations in the assistant message while forwarding their SSE events', async () => {
    const service = createPythonAiService();

    const events = await collect(service.processPythonAI(
      'user-1', session, '问题', 'text', {}, [], true,
    ));

    expect(events).toContainEqual({ type: 'citation', source: '指南.pdf', text: '参考片段' });
    const saved = service.saveMessage.mock.calls[0][0];
    expect(JSON.parse(saved.citations)).toEqual([{ source: '指南.pdf', text: '参考片段' }]);
  });

  it('returns stored citations as structured history data', async () => {
    const service = createPythonAiService();
    service.sessionRepo.findOne = jest.fn().mockResolvedValue({ user_id: 'user-1' });
    service.messageRepo = {
      find: jest.fn().mockResolvedValue([{
        id: 'message-1',
        role: 'assistant',
        content: '回答内容',
        intent: 'health_question',
        citations: JSON.stringify([{ source: '指南.pdf', text: '参考片段' }]),
        created_at: new Date(0),
      }]),
    };

    const result = await service.getMessages('user-1', 'session-1');

    expect(result.items[0].citations).toEqual([{ source: '指南.pdf', text: '参考片段' }]);
  });

  it('retains server TTS for callers that do not opt out', async () => {
    const service = createPythonAiService();

    const events = await collect(service.processPythonAI(
      'user-1', session, '问题', 'text', {}, [],
    ));

    expect(service.ttsService.synthesize).toHaveBeenCalledWith('回答内容');
    expect(events.some((event: any) => event.type === 'audio')).toBe(true);
  });
});
