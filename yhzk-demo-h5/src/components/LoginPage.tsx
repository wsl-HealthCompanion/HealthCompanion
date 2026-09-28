import { useState, useRef, useCallback } from 'react';
import { sendSmsCode, phoneLogin, saveAuth, type LoginResult } from '../services/auth';

interface Props {
  onLogin: (result: LoginResult) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendCode = async () => {
    const p = phone.replace(/\s/g, '');
    if (p.length !== 11) { setError('请输入11位手机号'); return; }
    setSending(true); setError('');
    try {
      const res = await sendSmsCode(p);
      startCountdown(res.retryAfter || 60);
    } catch (e: any) {
      setError(e.message || '发送失败，请稍后重试');
    } finally { setSending(false); }
  };

  const handleLogin = async () => {
    if (code.length !== 6) { setError('请输入6位验证码'); return; }
    setLoading(true); setError('');
    try {
      const result = await phoneLogin(phone.replace(/\s/g, ''), code);
      saveAuth(result);
      onLogin(result);
    } catch (e: any) {
      setError(e.message || '登录失败');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">炎</div>
        <h1 className="login-title">炎华众康</h1>
        <p className="login-sub">主动健康管理系统</p>

        <div className="login-field">
          <label>手机号</label>
          <div className="login-phone-row">
            <span className="login-prefix">+86</span>
            <input
              type="tel"
              maxLength={11}
              value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
              placeholder="请输入手机号"
              disabled={loading}
            />
          </div>
        </div>

        <div className="login-field">
          <label>验证码</label>
          <div className="login-code-row">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="6位验证码"
              disabled={loading}
            />
            <button
              className="login-send-btn"
              onClick={handleSendCode}
              disabled={sending || countdown > 0 || phone.length !== 11}
            >
              {countdown > 0 ? `${countdown}s` : sending ? '...' : '获取验证码'}
            </button>
          </div>
          <p className="login-hint">开发模式: 输入 123456 即可登录</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          className="login-btn"
          onClick={handleLogin}
          disabled={loading || code.length !== 6}
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </div>
    </div>
  );
}
