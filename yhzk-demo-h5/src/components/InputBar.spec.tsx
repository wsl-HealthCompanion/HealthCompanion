import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InputBar from './InputBar';

describe('InputBar — 拍照问一问入口', () => {
  it('渲染相机按钮与输入框', () => {
    const html = renderToStaticMarkup(createElement(InputBar, { onSend: vi.fn() }));
    expect(html).toContain('拍照问一问');       // aria-label
    expect(html).toContain('input-camera');
    expect(html).toContain('input-field');
    expect(html).toContain('input-send');
  });

  it('未选图时不渲染 chips 区', () => {
    const html = renderToStaticMarkup(createElement(InputBar, { onSend: vi.fn() }));
    expect(html).not.toContain('kb-image-chips');
  });
});
