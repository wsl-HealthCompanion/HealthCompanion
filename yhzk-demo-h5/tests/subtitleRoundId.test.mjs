import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('each answer sends a unique round id with subtitle segments', () => {
  assert.match(appSource, /const roundId = `round_\$\{Date\.now\(\)\}`/);
  assert.match(
    appSource,
    /digitalHuman\.speak\(cleaned,[\s\S]*?roundId,[\s\S]*?subtitleSegments: \[\{ index: segIdx, text: cleaned \}\]/,
  );
});

test('subtitle polling ignores events from previous answers', () => {
  assert.match(appSource, /if \(ev\.roundId !== roundId\) continue;/);
  assert.match(appSource, /stopSubtitlePolling\(\);[\s\S]*?setSubtitle\(msg\)/);
});

test('streamed TTS subtitles clear only after the final audio fragment completes', () => {
  assert.match(appSource, /ev\.status === 'subtitle'[\s\S]*?setSubtitle\(ev\.subtitleText\)/);
  assert.match(appSource, /ev\.status === 'complete'[\s\S]*?ev\.fragmentIndex === finalSubtitleIndexRef\.current[\s\S]*?setSubtitle\(''\)/);
});

test('subtitle polling keeps long streamed answers alive past 60 seconds', () => {
  assert.doesNotMatch(appSource, /}, 60000\);/);
});

test('only one globally cancellable subtitle poller can remain active', () => {
  assert.match(appSource, /const subtitleEventPollerRef = useRef/);
  assert.match(appSource, /const stopSubtitlePolling = useCallback/);
  assert.match(appSource, /subtitleEventPollerRef\.current = setInterval/);
});
