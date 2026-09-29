import type { ChatCitation, Emotion } from '../types';

export interface ChatEventCallbacks {
  onToken?: (char: string) => void;
  onThinking?: (content?: string) => void;
  onIntent?: (intent: string, emotion?: Emotion) => void;
  onSpeechChunk?: (text: string, index: number) => void;
  onEmotion?: (emotion: Emotion) => void;
  onCitation?: (citation: ChatCitation) => void;
  onDone?: (sessionId?: string) => void;
}

export function dispatchChatEvent(
  event: Record<string, unknown>,
  callbacks: ChatEventCallbacks,
): void {
  if (event.type === 'token') {
    callbacks.onToken?.(typeof event.content === 'string' ? event.content : '');
  } else if (event.type === 'thinking') {
    callbacks.onThinking?.(typeof event.content === 'string' ? event.content : '');
  } else if (event.type === 'speech_chunk') {
    callbacks.onSpeechChunk?.(
      typeof event.text === 'string' ? event.text : '',
      typeof event.index === 'number' ? event.index : 0,
    );
  } else if (event.type === 'intent') {
    const emotion = typeof event.emotion === 'string' ? event.emotion as Emotion : undefined;
    callbacks.onIntent?.(
      typeof event.primary === 'string'
        ? event.primary
        : typeof event.intent === 'string' ? event.intent : 'unknown',
      emotion,
    );
    if (emotion) callbacks.onEmotion?.(emotion);
  } else if (event.type === 'emotion') {
    const emotion = typeof event.detected === 'string'
      ? event.detected
      : typeof event.emotion === 'string' ? event.emotion : undefined;
    if (emotion) callbacks.onEmotion?.(emotion as Emotion);
  } else if (event.type === 'citation') {
    if (typeof event.source === 'string' && typeof event.text === 'string') {
      callbacks.onCitation?.({ source: event.source, text: event.text });
    }
  } else if (event.type === 'done') {
    if (typeof event.emotion === 'string') callbacks.onEmotion?.(event.emotion as Emotion);
    callbacks.onDone?.(typeof event.sessionId === 'string' ? event.sessionId : undefined);
  }
}
