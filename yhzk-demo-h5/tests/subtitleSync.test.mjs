import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSubtitleDelayMs,
  normalizeSubtitleSegments,
} from '../src/services/subtitleSync.ts';

test('subtitle delay follows the current media buffer without exceeding safety bounds', () => {
  assert.equal(computeSubtitleDelayMs(0), 80);
  assert.equal(computeSubtitleDelayMs(0.42), 500);
  assert.equal(computeSubtitleDelayMs(8), 3000);
  assert.equal(computeSubtitleDelayMs(Number.NaN), 80);
});

test('subtitle segments preserve explicit indexes and remove empty text', () => {
  assert.deepEqual(
    normalizeSubtitleSegments([
      { index: 2, text: ' 当前句 ' },
      { index: 3, text: ' ' },
      { index: 4, text: '下一句' },
    ]),
    [
      { index: 2, text: '当前句' },
      { index: 4, text: '下一句' },
    ],
  );
});
