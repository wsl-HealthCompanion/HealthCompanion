import { API_BASE } from '../config';
import { requestLogoutRevocation } from './authLogout';

const TOKEN_KEY = 'yhzk_token';
const REFRESH_KEY = 'yhzk_refresh_token';
const USER_KEY = 'yhzk_user';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
  user: {
    id: string;
    status: string;
    profileExists: boolean;
    advisorBound: boolean;
    isElderly: boolean;
    careMode: boolean;
  };
}

export interface StoredUser {
  id: string;
  status: string;
  profileExists: boolean;
  advisorBound: boolean;
  isElderly?: boolean;
  careMode?: boolean;
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as StoredUser : null;
  } catch {
    return null;
  }
}

export async function fetchCurrentUser(): Promise<StoredUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const resp = await fetch(`${API_BASE}/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return (json.data || json) as StoredUser;
  } catch {
    return null;
  }
}

export function updateStoredUserModes(isElderly: boolean, careMode: boolean) {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const user = JSON.parse(raw) as StoredUser;
    user.isElderly = isElderly;
    user.careMode = careMode;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

/** 发送短信验证码 */
export async function sendSmsCode(phone: string): Promise<{ expiresIn: number; retryAfter: number }> {
  const resp = await fetch(`${API_BASE}/auth/phone/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, type: 'login' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || '发送失败');
  }
  return resp.json();
}

/** 手机号+验证码登录 */
export async function phoneLogin(phone: string, code: string): Promise<LoginResult> {
  const resp = await fetch(`${API_BASE}/auth/phone/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json.message || '登录失败');
  }
  // NestJS 统一返回 { code, message, data: {...} }，剥掉外层
  return (json.data || json) as LoginResult;
}

/** 保存登录凭证到 localStorage */
export function saveAuth(result: LoginResult) {
  localStorage.setItem(TOKEN_KEY, result.accessToken);
  localStorage.setItem(REFRESH_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  localStorage.setItem('yhzk_uid', result.user.id);
}

/** 获取当前 token */
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

/** 是否已登录 */
export function isLoggedIn(): boolean {
  return !!getToken();
}

/** 登出 */
export function logout() {
  const accessToken = getToken();
  requestLogoutRevocation(API_BASE, accessToken);
  const uid = localStorage.getItem('yhzk_uid') || '';
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(`yhzk_last_session_${uid}`);
  localStorage.removeItem('yhzk_uid');
  localStorage.removeItem('yhzk_last_session'); // 清除旧的非用户隔离key
}
