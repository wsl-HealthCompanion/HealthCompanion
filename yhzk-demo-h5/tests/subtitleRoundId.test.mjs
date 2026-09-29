import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('each answer gets a unique round id and routes speech chunks to that round', () => {
  assert.match(appSource, /const roundId = `round_\$\{Date\.now\(\)\}`/);
  assert.match(appSource, /xmovAvatar\.pushSpeechChunk\(roundId, cleaned\)/);
  assert.match(appSource, /xmovAvatar\.finishRound\(roundId\)/);
});

test('subtitle polling stops when the conversation or capability is stale', () => {
  assert.match(appSource, /if \(!isCurrentConversation\(\) \|\| !digitalHumanCapability\?\.isCurrent\(\)\)/);
  assert.match(appSource, /if \(!isCurrentConversation\(\) \|\| !digitalHumanCapability\.isCurrent\(\)\) return;/);
});

test('streamed TTS subtitle events update the visible subtitle', () => {
  assert.match(appSource, /ev\.status === 'subtitle' && ev\.subtitleText[\s\S]*?setSubtitle\(ev\.subtitleText\)/);
});

test('subtitle polling has a bounded lifetime and clears its shared reference', () => {
  assert.match(appSource, /if \(subtitlePollerRef\.current === subtitleEventPoller\) subtitlePollerRef\.current = null;[\s\S]*?\}, 60000\);/);
});

test('one shared ref allows the current subtitle poller to be cancelled', () => {
  assert.match(appSource, /const subtitlePollerRef = useRef/);
  assert.match(appSource, /if \(subtitlePollerRef\.current\) clearInterval\(subtitlePollerRef\.current\)/);
  assert.match(appSource, /subtitlePollerRef\.current = subtitleEventPoller/);
});
