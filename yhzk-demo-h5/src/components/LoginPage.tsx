import { useState } from 'react';
import { phoneLogin, saveAuth, type LoginResult } from '../services/auth';

interface Props {
  onLogin: (result: LoginResult) => void;
}

/** 演示账号 — 页面上只是一道简单的门, 底层走后端开发模式登录(固定演示手机号+验证码) */
const DEMO_ACCOUNT = 'admin';
const DEMO_PASSWORD = '123456';
const DEMO_PHONE = '17777777777';
const DEMO_CODE = '123456';

export default function LoginPage({ onLogin }: Props) {
  const [account, setAccount] = useState(DEMO_ACCOUNT);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (account.trim() !== DEMO_ACCOUNT || password !== DEMO_PASSWORD) {
      setError('账号或密码不正确');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await phoneLogin(DEMO_PHONE, DEMO_CODE);
      saveAuth(result);
      onLogin(result);
    } catch (e: any) {
      setError(e.message || '登录失败，请确认后端已启动');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">康</div>
        <h1 className="login-title">康伴智生</h1>
        <p className="login-sub">生活助手</p>

        <div className="login-field">
          <label>账号</label>
          <input
            type="text"
            value={account}
            onChange={e => { setAccount(e.target.value); setError(''); }}
            placeholder="账号"
            disabled={loading}
            autoComplete="username"
          />
        </div>

        <div className="login-field">
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
            placeholder="密码"
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          className="login-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? '登录中...' : '登录'}
        </button>
        <p className="login-hint">演示账号: admin / 123456</p>
      </div>
    </div>
  );
}
