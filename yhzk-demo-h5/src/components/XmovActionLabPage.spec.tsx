import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  XmovActionLabView,
  type ActionLabState,
} from './XmovActionLabPage';

function render(state: ActionLabState): string {
  return renderToStaticMarkup(<XmovActionLabView state={state} />);
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

  it('does not expose preview or playback controls in M1.3', () => {
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

    expect(html).not.toContain('播放');
    expect(html).not.toContain('试播');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<img');
  });
});
