import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from './LoginPage';

describe('LoginPage — 品牌与演示账号', () => {
  const html = renderToStaticMarkup(createElement(LoginPage, { onLogin: vi.fn() }));

  it('品牌文案为 康伴智生 / 生活助手', () => {
    expect(html).toContain('康伴智生');
    expect(html).toContain('生活助手');
    expect(html).not.toContain('炎华众康');
  });

  it('预填演示账号 admin / 123456, 一键登录', () => {
    expect(html).toContain('value="admin"');
    expect(html).toContain('value="123456"');
    expect(html).toContain('登录');
    expect(html).not.toContain('获取验证码'); // 不再是手机验证码流程
  });
});
