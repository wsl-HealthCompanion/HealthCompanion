import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dispatchChatEvent } from '../src/services/chatEvents.ts';

test('citation SSE events are delivered to the chat callback', () => {
  const citations = [];
  dispatchChatEvent(
    { type: 'citation', source: '指南.pdf', text: '血压测量说明' },
    { onCitation: (citation) => citations.push(citation) },
  );

  assert.deepEqual(citations, [{ source: '指南.pdf', text: '血压测量说明' }]);
});

test('done is dispatched as soon as its event is parsed', () => {
  const completed = [];
  dispatchChatEvent(
    { type: 'done', sessionId: 'session-1' },
    { onDone: (sessionId) => completed.push(sessionId) },
  );

  assert.deepEqual(completed, ['session-1']);
});

test('the Xmov speech stream closes from done instead of waiting for HTTP EOF', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const onDone = app.slice(app.indexOf('onDone: (sid) =>'), app.indexOf('},\n        },', app.indexOf('onDone: (sid) =>')));

  assert.match(onDone, /xmovAvatar\.finishRound\(roundId\)/);
});
