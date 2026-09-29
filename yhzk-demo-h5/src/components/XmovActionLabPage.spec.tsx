import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  XmovActionLabView,
  type ActionLabState,
} from './XmovActionLabPage';

interface FuturePlaybackState {
  semantic: string;
  status: 'running' | 'success' | 'error';
  message: string;
}

interface FutureViewProps {
  state: ActionLabState;
  playback: FuturePlaybackState | null;
  onExecuteAction: (semantic: string) => void;
}

function render(
  state: ActionLabState,
  playback: FuturePlaybackState | null = null,
): string {
  const View = XmovActionLabView as unknown as ComponentType<FutureViewProps>;
  return renderToStaticMarkup(createElement(View, {
    state,
    playback,
    onExecuteAction: () => undefined,
  }));
}

describe('XmovActionLabView', () => {
  it('renders a loading state', () => {
    const html = render({
      status: 'loading',
      actions: [],
      error: '',
    });

    expect(html).toContain('正在读取真实 KA 动作');
  });

  it('renders the total and action metadata for a ready list', () => {
    const html = render({
      status: 'ready',
      error: '',
      actions: [
        {
          semantic: 'PointingSelf',
          name: 'PointingSelf',
          cnName: '指向自己',
          type: 'body_action',
          rawName: 'M_CN03_show03__PointingSelf',
        },
        {
          semantic: 'Wave',
          name: 'Wave',
          cnName: '挥手',
          type: 'gesture',
          rawName: 'prefix__Wave',
        },
      ],
    });

    expect(html).toContain('共 2 个动作');
    expect(html).toContain('PointingSelf');
    expect(html).toContain('Wave');
    expect(html).toContain('指向自己');
    expect(html).toContain('挥手');
    expect(html).toContain('body_action');
    expect(html).toContain('gesture');
  });

  it('renders an explicit empty state for a valid empty list', () => {
    const html = render({
      status: 'ready',
      actions: [],
      error: '',
    });

    expect(html).toContain('共 0 个动作');
    expect(html).toContain('暂无可用 KA 动作');
  });

  it('renders an API error separately from the empty state', () => {
    const html = render({
      status: 'error',
      actions: [],
      error: 'Xmov actions request failed: HTTP 502',
    });

    expect(html).toContain('动作列表加载失败');
    expect(html).toContain('HTTP 502');
    expect(html).not.toContain('暂无可用 KA 动作');
  });

  it('renders real image and video previews without autoplay', () => {
    const html = render({
      status: 'ready',
      error: '',
      actions: [{
        semantic: 'PointingSelf',
        name: 'PointingSelf',
        cnName: '指向自己',
        type: 'body_action',
        imageUrl: 'https://example.test/a.png',
        movieUrl: 'https://example.test/a.mp4',
      }],
    });

    expect(html).toContain('<img');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<video');
    expect(html).toContain('controls=""');
    expect(html).toContain('preload="metadata"');
    expect(html).not.toContain('autoplay');
    expect(html).toContain('执行动作');
  });

  it('keeps actions executable when no preview resource exists', () => {
    const html = render({
      status: 'ready',
      error: '',
      actions: [{
        semantic: 'Wave',
        name: 'Wave',
        cnName: '',
        type: 'gesture',
      }],
    });

    expect(html).toContain('Wave');
    expect(html).toContain('暂无预览资源');
    expect(html).toContain('执行动作');
  });

  it('disables execution while a KA action is running', () => {
    const html = render({
      status: 'ready',
      error: '',
      actions: [{
        semantic: 'PointingSelf',
        name: 'PointingSelf',
        cnName: '指向自己',
        type: 'body_action',
      }],
    }, {
      semantic: 'PointingSelf',
      status: 'running',
      message: '执行中',
    });

    expect(html).toContain('执行中');
    expect(html).toContain('disabled=""');
  });

  it('renders playback success and SDK failure feedback', () => {
    const state: ActionLabState = {
      status: 'ready',
      error: '',
      actions: [{
        semantic: 'PointingSelf',
        name: 'PointingSelf',
        cnName: '指向自己',
        type: 'body_action',
      }],
    };

    const success = render(state, {
      semantic: 'PointingSelf',
      status: 'success',
      message: '已提交给 Xmov SDK，请观察数字人实际动作',
    });
    const failure = render(state, {
      semantic: 'PointingSelf',
      status: 'error',
      message: 'SDK rejected KA',
    });

    expect(success).toContain('已提交给 Xmov SDK');
    expect(failure).toContain('SDK rejected KA');
  });
});
