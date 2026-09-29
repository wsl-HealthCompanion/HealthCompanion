import { useState, useRef, useCallback, useEffect } from 'react';
import DigitalHumanPlayer from './components/DigitalHumanPlayer';
import XmovAvatarPlayer from './components/XmovAvatarPlayer';
import { AVATAR_PROVIDER } from './avatar/xmovConfig';
import PresetQuestions from './components/PresetQuestions';
import InputBar from './components/InputBar';
import ProfileCard from './components/ProfileCard';
import ProfilePage from './components/ProfilePage';
import Onboarding from './components/Onboarding';
import LoginPage from './components/LoginPage';
import StatusBanner from './components/StatusBanner';
import { streamChat, sendChatJson, fetchSessions, fetchMessages } from './services/chat';
import type { SessionItem, MessageItem } from './services/chat';
import { digitalHuman } from './services/digitalHuman';
import { xmovAvatar } from './services/xmovAvatar';
import {
  fetchCurrentUser,
  getStoredUser,
  isLoggedIn,
  logout as doLogout,
  updateStoredUserModes,
} from './services/auth';
import { saveProfileToBackend, loadProfileFromBackend } from './services/user';
import { exitAuthenticatedSession } from './appSession';
import { getGreeting, getPresetQuestions } from './presetProfile';
import type { PresetProfile } from './presetProfile';
import type { ChatCitation, ChatMessage, Emotion } from './types';
import './index.scss';

type DhStatus = 'idle' | 'thinking' | 'speaking';
type Tab = 'dh' | 'chat' | 'profile';

// 已改用 LiveTalking subtitle_events 轮询，不再前端估算时间

// 清理 AI 回复中的 Markdown 格式符号
const cleanMd = (s: string) => s.replace(/(\*{1,3}|#{1,4}\s?|`{1,3}|~~)/g, '').trim();

function splitSpokenText(input: string): string[] {
  const text = cleanMd(input);
  if (!text) return [];

  const strong = /[。！？；!?;]/;
  const weak = /[，、,：:]/;
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };

  try {
    const segmenter = new (Intl as any).Segmenter('zh-CN', { granularity: 'word' });
    for (const part of segmenter.segment(text)) {
      const word = part.segment;
      const candidate = current + word;
      if (strong.test(candidate) || (weak.test(candidate) && current.length >= 10) || current.length >= 18) {
        flush();
        current = word;
      } else {
        current += word;
      }
    }
  } catch {
    for (const char of text) {
      const candidate = current + char;
      if (strong.test(candidate) || (weak.test(candidate) && current.length >= 10) || current.length >= 18) {
        flush();
        current = char;
      } else {
        current += char;
      }
    }
  }
  flush();
  return chunks;
}

// ── 按用户隔离的 localStorage 助手 ──
const getUid = () => localStorage.getItem('yhzk_uid') || 'demo';

function loadProfile(): PresetProfile {
  try {
    const raw = localStorage.getItem(`yhzk_profile_${getUid()}`);
    if (raw) return JSON.parse(raw) as PresetProfile;
  } catch { /* ignore */ }
  // 不返回 demo 数据 — 新用户必须建档才有档案
  return {
    name: '', gender: 'male' as const, age: 30,
    diseases: [], medications: [], allergies: [],
    profileData: {},
  };
}

function saveProfile(p: PresetProfile) {
  try {
    localStorage.setItem(`yhzk_profile_${getUid()}`, JSON.stringify(p));
    localStorage.setItem(`yhzk_profile_ts_${getUid()}`, String(Date.now()));
  } catch { /* ignore */ }
}

/** 后端档案数据 → 前端 PresetProfile */
function backendToProfile(pd: Record<string, any>): PresetProfile | null {
  try {
    const s1: any = pd.step1 || {};
    const s2a: any = pd.step2a || {};
    const s2b: any = pd.step2b || {};
    const s2c: any = pd.step2c || {};
    const names = (arr: any[]) => arr?.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean) ?? [];
    const age = s1.birthDate ? Math.floor((Date.now() - new Date(s1.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)) : 30;
    return {
      name: s1.name || '用户',
      gender: s1.gender || 'male',
      age,
      diseases: names(s2a.diseases),
      medications: names(s2c.medications),
      allergies: names(s2b.allergies),
      profileData: pd,
    };
  } catch { return null; }
}

function obDone(): boolean {
  return !!localStorage.getItem(`yhzk_ob_done_${getUid()}`);
}
function setObDone() {
  localStorage.setItem(`yhzk_ob_done_${getUid()}`, '1');
}

function loadUserModes(): { isElderly: boolean; careMode: boolean } {
  const user = getStoredUser();
  return {
    isElderly: Boolean(user?.isElderly),
    careMode: Boolean(user?.careMode),
  };
}

export default function App() {
  const useXmovAvatar = AVATAR_PROVIDER === 'xmov';
  const [onboardingDone, setOnboardingDone] = useState(obDone);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [subtitle, setSubtitle] = useState(() => getGreeting(loadProfile()));
  const [subtitleRole, setSubtitleRole] = useState<'user' | 'assistant'>('assistant');
  const [status, setStatus] = useState<DhStatus>('idle');
  const [streamText, setStreamText] = useState('');
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const handleUnlockAudio = useCallback(() => setAudioEnabled(true), []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('dh');
  const [profile, setProfile] = useState<PresetProfile>(loadProfile);
  const [reOnboard, setReOnboard] = useState(false);
  const [alert, setAlert] = useState<{type:'error'|'warning'|'info'; msg:string; detail?:string}|null>(null);
  const [editText, setEditText] = useState('');
  const [loggedIn, setLoggedIn] = useState(isLoggedIn);
  const [digitalHumanStreamUrl, setDigitalHumanStreamUrl] = useState<string | null>(null);
  const [appKey, setAppKey] = useState(0);
  const [userModes, setUserModes] = useState(loadUserModes);
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('yhzk_font_size') || '0', 10);
    if (saved > 0) return saved;
    const modes = loadUserModes();
    if (modes.careMode) return 20;
    if (modes.isElderly) return 18;
    return 16;
  });

  // ── 会话管理 ──
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [showSessions, setShowSessions] = useState(false);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    const items = await fetchSessions();
    setSessions(items);
    // 自动选中最新会话（如果当前没有选中且有会话）
    if (!currentSessionId && items.length > 0) {
      setCurrentSessionId(items[0].sessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!loggedIn) return;
    loadSessions().then(() => {
      const lastSid = localStorage.getItem(`yhzk_last_session_${getUid()}`);
      if (lastSid) { switchSession(lastSid); }
    });
  }, [loggedIn]); // eslint-disable-line

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    fetchCurrentUser().then((user) => {
      if (!active || !user) return;
      const next = {
        isElderly: Boolean(user.isElderly),
        careMode: Boolean(user.careMode),
      };
      setUserModes(next);
      updateStoredUserModes(next.isElderly, next.careMode);
    });
    return () => { active = false; };
  }, [loggedIn, appKey]);

  const isBusy = status !== 'idle';
  const contentRef = useRef('');
  const statusRef = useRef<DhStatus>('idle');
  const lastMsgRef = useRef<string>(''); // 记录最后一条消息，用于重试
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const subtitleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const conversationGenerationRef = useRef(0);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const subtitlePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 待触发的字幕定时器列表，新消息/打断时全部取消
  statusRef.current = status;

  const clearSubtitleTimers = useCallback(() => {
    subtitleTimersRef.current.forEach(t => clearTimeout(t));
    subtitleTimersRef.current = [];
  }, []);

  // 流式文本按帧刷新，避免每个 token 都触发一次重渲染
  const streamFlushRef = useRef<number | null>(null);
  const scheduleStreamFlush = useCallback(() => {
    if (streamFlushRef.current !== null) return;
    streamFlushRef.current = requestAnimationFrame(() => {
      streamFlushRef.current = null;
      setStreamText(contentRef.current);
    });
  }, []);
  const cancelStreamFlush = useCallback(() => {
    if (streamFlushRef.current !== null) {
      cancelAnimationFrame(streamFlushRef.current);
      streamFlushRef.current = null;
    }
    setStreamText('');
  }, []);

  const cancelActiveConversation = useCallback(() => {
    conversationGenerationRef.current += 1;
    conversationAbortRef.current?.abort();
    conversationAbortRef.current = null;
    if (subtitlePollerRef.current) clearInterval(subtitlePollerRef.current);
    subtitlePollerRef.current = null;
    clearSubtitleTimers();
    cancelStreamFlush();
    if (useXmovAvatar) void xmovAvatar.interrupt();
  }, [clearSubtitleTimers, cancelStreamFlush, useXmovAvatar]);

  // 切换会话 → 加载历史消息
  const switchSession = useCallback(async (sid: string) => {
    cancelActiveConversation();
    setCurrentSessionId(sid);
    localStorage.setItem(`yhzk_last_session_${getUid()}`, sid); // 记住当前会话
    setShowSessions(false);
    setMessages([]);
    setStatus('idle');
    const generation = conversationGenerationRef.current;
    const msgs = await fetchMessages(sid);
    if (conversationGenerationRef.current !== generation) {
      // 历史加载期间用户已开启新一轮，不覆盖新一轮的消息
      return;
    }
    setMessages(msgs.map((m: MessageItem, i: number) => ({
      id: m.id || `m_${i}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      citations: m.citations,
    })));
    // 切到对话Tab
    setActiveTab('chat');
  }, [cancelActiveConversation]);

  // 新建会话
  const newSession = useCallback(() => {
    cancelActiveConversation();
    setCurrentSessionId('');
    setSessionId('');
    setMessages([]);
    setSubtitle(getGreeting(profile));
    setSubtitleRole('assistant');
    setStatus('idle');
    setShowSessions(false);
    setActiveTab('dh');
    loadSessions(); // 刷新会话列表
  }, [loadSessions, cancelActiveConversation]);

  // 建档完成回调
  const handleOnboardingComplete = useCallback((p: PresetProfile) => {
    setProfile(p);
    saveProfile(p);
    setObDone();
    setOnboardingDone(true);
    saveProfileToBackend(p.profileData);
    setSubtitle(getGreeting(p)); // 建档后更新欢迎语
    setActiveTab('profile');
  }, []);

  // 进页面即连接数字人。TTS 预热由 LiveTalking 进程统一执行，
  // 避免每个页面重复合成“嗯”并与用户的首次回答竞争。
  // 字号同步到 html 根元素（让 rem 单位生效）
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  useEffect(() => {
    document.body.classList.toggle('elderly-mode', userModes.isElderly);
    document.body.classList.toggle('care-mode', userModes.careMode);
  }, [userModes]);

  useEffect(() => {
    if (useXmovAvatar) {
      digitalHuman.invalidate();
      setDigitalHumanStreamUrl(null);
      return;
    }

    const unsubscribe = digitalHuman.subscribe((session) => {
      setDigitalHumanStreamUrl(session?.streamUrl ?? null);
    });
    if (!loggedIn || !onboardingDone) {
      digitalHuman.invalidate();
      setDigitalHumanStreamUrl(null);
      unsubscribe();
      return;
    }
    let active = true;
    digitalHuman.connect().then((session) => {
      if (active) setDigitalHumanStreamUrl(session?.streamUrl ?? null);
    }).catch(() => {
      if (!active) return;
      setDigitalHumanStreamUrl(null);
      setAlert({type:'warning', msg:'数字人服务未就绪', detail:'当前用户的独立数字人会话创建失败，请稍后重试'});
    });
    return () => {
      active = false;
      unsubscribe();
      setDigitalHumanStreamUrl(null);
      void digitalHuman.disconnect();
    };
  }, [loggedIn, onboardingDone, useXmovAvatar]);

  // 新消息自动滚到底部（只在新增消息时，不在 token 流式更新时）
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);  // 只监听数量变化，不监听 content 变化

  const handleSend = useCallback(async (text: string) => {
    const msg = String(text || '').trim();
    if (!msg || isBusy) return;

    conversationAbortRef.current?.abort();
    if (subtitlePollerRef.current) clearInterval(subtitlePollerRef.current);
    subtitlePollerRef.current = null;
    const conversationAbort = new AbortController();
    const conversationGeneration = ++conversationGenerationRef.current;
    const roundId = `round_${Date.now()}`;
    conversationAbortRef.current = conversationAbort;

    if (useXmovAvatar) void xmovAvatar.interruptAndBegin(roundId);

    let digitalHumanCapability = useXmovAvatar ? null : digitalHuman.capture();
    const isCurrentConversation = () => !conversationAbort.signal.aborted
      && conversationGenerationRef.current === conversationGeneration;
    const digitalHumanCapabilityReady = useXmovAvatar
      ? Promise.resolve(null)
      : digitalHumanCapability
        ? Promise.resolve(digitalHumanCapability)
        : digitalHuman.connect()
            .then(() => isCurrentConversation() ? digitalHuman.capture() : null)
            .catch(() => null);

    lastMsgRef.current = msg; // 保存用于重试
    setAudioEnabled(true);
    digitalHumanCapability?.interrupt().catch(() => {});
    clearSubtitleTimers(); // 取消上一轮残留的字幕定时器

    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', content: msg }]);
    setSubtitle(msg);
    setSubtitleRole('user');
    setStatus('thinking');
    contentRef.current = '';

    let aiEmotion: Emotion = 'neutral';
    let responseCitations: ChatCitation[] = [];
    let fallbackSpeechBuffer = '';
    let nextSubtitleIdx = 0;
    let speechChunkMode = false;
    let subtitleEventPoller: ReturnType<typeof setInterval> | null = null;
    let lastSubtitleEventId = 0;
    let isFirstSpeak = true;
    let speakChain: Promise<void> = Promise.resolve();  // 串行化 speak 请求，防止乱序

    // 首次 speak 时启动字幕轮询，后续复用
    const startSubtitlePoller = () => {
      if (useXmovAvatar || subtitleEventPoller) return;
      lastSubtitleEventId = 0;
      subtitleEventPoller = setInterval(async () => {
        if (!isCurrentConversation() || !digitalHumanCapability?.isCurrent()) {
          if (subtitleEventPoller) clearInterval(subtitleEventPoller);
          if (subtitlePollerRef.current === subtitleEventPoller) subtitlePollerRef.current = null;
          subtitleEventPoller = null;
          return;
        }
        const events = await digitalHumanCapability.pollSubtitleEvents(lastSubtitleEventId);
        if (!isCurrentConversation() || !digitalHumanCapability.isCurrent()) return;
        for (const ev of events) {
          lastSubtitleEventId = Math.max(lastSubtitleEventId, ev.eventId);
          if (ev.status === 'subtitle' && ev.subtitleText) {
            setSubtitle(ev.subtitleText);
            setSubtitleRole('assistant');
          }
        }
      }, 200);
      subtitlePollerRef.current = subtitleEventPoller;
      setTimeout(() => {
        if (subtitleEventPoller) {
          clearInterval(subtitleEventPoller);
          if (subtitlePollerRef.current === subtitleEventPoller) subtitlePollerRef.current = null;
          subtitleEventPoller = null;
        }
      }, 60000);
    };

    const enqueueSpeech = (rawText: string, segIdx: number) => {
      const cleaned = cleanMd(rawText);
      if (!cleaned) return;

      if (useXmovAvatar) {
        setSubtitle(cleaned);
        setSubtitleRole('assistant');
        xmovAvatar.pushSpeechChunk(roundId, cleaned);
        return;
      }

      const needInterrupt = isFirstSpeak;
      isFirstSpeak = false;
      // 排队：等上一个 speak 发完再发下一个，保证顺序不被打乱
      speakChain = speakChain.then(async () => {
        const capability = await digitalHumanCapabilityReady;
        if (!capability || !isCurrentConversation() || !capability.isCurrent()) return;
        digitalHumanCapability = capability;
        startSubtitlePoller();
        await capability.speak(cleaned, {
          interrupt: needInterrupt,
          emotion: aiEmotion,
          roundId,
          subtitleSegments: [{ index: segIdx, text: cleaned }],
        });
      }).catch(() => {});
    };

    const handleSpeechChunk = (rawText: string) => {
      if (!isCurrentConversation() || !rawText.trim()) return;
      speechChunkMode = true;
      fallbackSpeechBuffer = '';
      enqueueSpeech(rawText, nextSubtitleIdx++);
    };

    const feedDisplayChar = (char: string) => {
      if (!isCurrentConversation()) return;
      contentRef.current += char;
      if (statusRef.current !== 'speaking') setStatus('speaking');
      scheduleStreamFlush();
    };

    const feedFallbackSpeechChar = (char: string) => {
      if (!isCurrentConversation() || speechChunkMode) return;
      fallbackSpeechBuffer += char;

      // AI 确认词后紧跟逗号时，强制换成感叹号，第一句可以更早发出。
      fallbackSpeechBuffer = fallbackSpeechBuffer.replace(/^(好的|明白了|嗯)[，,]/, '$1！');
    };

    try {
      const result = await streamChat(
        { message: msg, sessionId: currentSessionId || sessionId, profile: profile.profileData, skipTts: true },
        {
          onToken: (char) => {
            if (!isCurrentConversation()) return;
            feedDisplayChar(char);
            feedFallbackSpeechChar(char);
          },
          onThinking: () => {
            if (isCurrentConversation() && useXmovAvatar) void xmovAvatar.think(roundId);
          },
          onIntent: (intent, intentEmotion) => {
            if (!isCurrentConversation() || !useXmovAvatar) return;
            xmovAvatar.setIntent(roundId, intent, intentEmotion);
          },
          onSpeechChunk: (text) => {
            if (isCurrentConversation()) handleSpeechChunk(text);
          },
          onEmotion: (e) => { if (isCurrentConversation()) { aiEmotion = e; setEmotion(e); } },
          onCitation: (citation) => {
            if (isCurrentConversation()) responseCitations.push(citation);
          },
          onDone: (sid) => {
            if (!isCurrentConversation()) return;
            if (useXmovAvatar) xmovAvatar.finishRound(roundId);
            if (sid) {
              if (!currentSessionId) { setCurrentSessionId(sid); localStorage.setItem(`yhzk_last_session_${getUid()}`, sid); }
              if (!sessionId) setSessionId(sid);
            }
          },
        },
        conversationAbort.signal,
      );

      if (!isCurrentConversation()) return;

      if (!result.streamed) {
        const json = await sendChatJson(
          { message: msg, sessionId, profile: profile.profileData, skipTts: true },
          conversationAbort.signal,
        );
        if (!isCurrentConversation()) return;
        aiEmotion = json.emotion;
        responseCitations = json.citations;
        setEmotion(json.emotion);
        if (json.sessionId) {
          if (!currentSessionId) { setCurrentSessionId(json.sessionId); localStorage.setItem(`yhzk_last_session_${getUid()}`, json.sessionId); }
          if (!sessionId) setSessionId(json.sessionId);
        }
        setStatus('speaking');
        contentRef.current += json.answer;
        setStreamText(contentRef.current);
        for (const chunk of splitSpokenText(json.answer)) {
          if (!isCurrentConversation()) return;
          enqueueSpeech(chunk, nextSubtitleIdx++);
        }
      }
    } catch {
      if (!isCurrentConversation()) return;
      if (useXmovAvatar) void xmovAvatar.interrupt();
      setAlert({type:'error', msg:'AI 服务未响应', detail:'点击重试，或检查后端是否已启动'});
    }

    if (!isCurrentConversation()) return;

    if (!speechChunkMode && fallbackSpeechBuffer.trim()) {
      for (const chunk of splitSpokenText(fallbackSpeechBuffer)) {
        enqueueSpeech(chunk, nextSubtitleIdx++);
      }
      fallbackSpeechBuffer = '';
    }

    if (useXmovAvatar) xmovAvatar.finishRound(roundId);

    const finalContent = contentRef.current || '抱歉，我暂时无法回答，请稍后再试。';
    cancelStreamFlush();
    setMessages(prev => [...prev, {
      id: `a_${Date.now()}`,
      role: 'assistant',
      content: finalContent,
      citations: responseCitations,
    }]);
    setTimeout(() => {
      if (conversationGenerationRef.current === conversationGeneration) setStatus('idle');
    }, 1500);
    if (conversationAbortRef.current === conversationAbort) conversationAbortRef.current = null;
  }, [isBusy, currentSessionId, sessionId, profile, useXmovAvatar]);

  const handleProfileSave = useCallback((p: PresetProfile) => {
    setProfile(p);
    saveProfile(p);
    setProfileOpen(false);
    // 注: 快速编辑只覆盖部分字段，不同步到后端（用"完整建档"同步）
  }, []);

  // ProfileCard 里点"重新建档" → 打开完整向导
  const handleReonboard = useCallback(() => {
    setProfileOpen(false);
    setReOnboard(true);
  }, []);

  const handleLogout = useCallback(() => {
    cancelActiveConversation();
    setDigitalHumanStreamUrl(null);
    exitAuthenticatedSession({
      interruptDigitalHuman: () => {
        if (useXmovAvatar) void xmovAvatar.interrupt();
        else void digitalHuman.disconnect();
      },
      clearAuthentication: doLogout,
      refreshView: () => setAppKey(k => k + 1),
      showLogin: () => {
        setLoggedIn(false);
        setUserModes({ isElderly: false, careMode: false });
      },
    });
  }, [cancelActiveConversation, useXmovAvatar]);

  useEffect(() => digitalHuman.onAuthenticationLost(handleLogout), [handleLogout]);

  // 所有 hooks 之后才判断
  // 未登录 → 显示登录页
  if (!loggedIn) return <div key={appKey}><LoginPage onLogin={async (result) => {
    digitalHuman.invalidate();
    setDigitalHumanStreamUrl(null);
    localStorage.setItem('yhzk_uid', result.user.id);
    // 清理所有旧会话 key
    localStorage.removeItem('yhzk_last_session');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('yhzk_last_session_') && !k.endsWith(`_${result.user.id}`)) {
        localStorage.removeItem(k);
      }
    }
    setMessages([]);
    setSessions([]);
    setCurrentSessionId('');
    setUserModes({
      isElderly: Boolean(result.user.isElderly),
      careMode: Boolean(result.user.careMode),
    });
    if (!localStorage.getItem('yhzk_font_size')) {
      setFontSize(result.user.careMode ? 20 : result.user.isElderly ? 18 : 16);
    }
    // 1. 先从后端拉档案
    const backendPd = await loadProfileFromBackend();
    if (backendPd) {
      const bp = backendToProfile(backendPd);
      if (bp) {
        // 和本地档案比较：本地更新 → 同步到后端
        const local = loadProfile();
        if (local.profileData?.step1?.name && local.profileData.step1.name !== '张伯') {
          const localUpdated = Number(localStorage.getItem(`yhzk_profile_ts_${result.user.id}`) || 0);
          const backendUpdated = new Date(backendPd.step1?.updatedAt || 0).getTime();
          if (localUpdated > backendUpdated) {
            saveProfileToBackend(local.profileData); // 本地更新 → 推到后端
          }
        }
        setProfile(bp); saveProfile(bp); setObDone(); setOnboardingDone(true); setLoggedIn(true); return;
      }
    }
    // 2. 后端没有档案 → 不管是新老用户，没有档案就强制建档
    const localProfile = loadProfile();
    const hasProfile = !!(localProfile.name && localProfile.profileData?.step1?.name);
    if (hasProfile) {
      setProfile(localProfile);
      setOnboardingDone(true);
    } else {
      setOnboardingDone(false); // 强制建档，不注入任何假数据
    }
    setAppKey(k => k + 1);
    setLoggedIn(true);
  }} /></div>;

  // 未建档 → 显示建档向导
  if (!onboardingDone) return <div key={appKey}><Onboarding
    onComplete={handleOnboardingComplete}
    onClose={handleLogout}
    closeLabel="退出登录"
  /></div>;

  // 重新建档时显示建档向导（预填已有档案数据）
  if (reOnboard) return <div key={appKey}><Onboarding
    onComplete={(p) => { setProfile(p); saveProfile(p); setReOnboard(false); saveProfileToBackend(p.profileData); }}
    initialProfile={profile}
    onClose={() => setReOnboard(false)}
  /></div>;

  return (
    <div className="app">
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="app-title">
          <div className="app-logo">炎</div>
          <div>
            <div className="app-title-text">炎华众康</div>
            <div className="app-title-sub">主动健康管理系统</div>
          </div>
        </div>
        <div className="app-actions">
          <button className="app-btn app-font-btn" onClick={() => { const s = Math.max(12, fontSize - 2); setFontSize(s); localStorage.setItem('yhzk_font_size', String(s)); }}>A⁻</button>
          <button className="app-btn app-font-btn" onClick={() => { const s = Math.min(24, fontSize + 2); setFontSize(s); localStorage.setItem('yhzk_font_size', String(s)); }}>A⁺</button>
          <button className="app-btn" onClick={() => setActiveTab(activeTab==='profile'?'dh':'profile')}>👤 我的</button>
          <button className="app-btn" onClick={handleLogout}>🚪 登出</button>
        </div>
      </header>

      {alert && (
        <StatusBanner
          type={alert.type}
          message={alert.msg}
          detail={alert.detail}
          onClose={() => setAlert(null)}
          onRetry={alert.type === 'error' && lastMsgRef.current ? () => { setAlert(null); handleSend(lastMsgRef.current); } : undefined}
        />
      )}

      <ProfileCard
        open={profileOpen}
        profile={profile}
        onClose={() => setProfileOpen(false)}
        onSave={handleProfileSave}
        onReonboard={handleReonboard}
      />

      {/* Tab 切换栏 — 仅手机端可见，桌面端隐藏 */}
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab==='dh'?'active':''}`} onClick={()=>setActiveTab('dh')}>🤖 数字人</button>
        <button className={`tab-btn ${activeTab==='chat'?'active':''}`} onClick={()=>{setActiveTab('chat');setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:'smooth'}),50);}}>💬 对话</button>
      </div>

      {/* 主体区域 */}
      <main className={`app-main ${activeTab === 'dh' ? 'tab-dh' : activeTab === 'chat' ? 'tab-chat active' : 'tab-profile'}`}>
        {/* 左侧：数字人舞台 */}
        <div className="stage">
          {useXmovAvatar ? (
            <XmovAvatarPlayer
              subtitle={subtitle}
              subtitleRole={subtitleRole}
            />
          ) : (
            <DigitalHumanPlayer
              streamUrl={digitalHumanStreamUrl}
              status={status}
              emotion={emotion}
              audioEnabled={audioEnabled}
              onUnlockAudio={handleUnlockAudio}
              subtitle={subtitle}
              subtitleRole={subtitleRole}
            />
          )}
        </div>

        {/* 右侧：对话历史 / 我的页面 */}
        <div className="chat-panel">
          {activeTab === 'profile' ? (
            <ProfilePage profile={profile} onEdit={() => { setReOnboard(true); }} />
          ) : (
          <>
            {/* 会话切换器 — 固定在顶部不滚动 */}
            <div className="session-bar">
              <button className="session-new" onClick={newSession} title="新建会话">＋ 新会话</button>
              <button className="session-list-btn" onClick={() => { loadSessions(); setShowSessions(!showSessions); }}>
                📋 历史 ({sessions.length})
              </button>
            </div>
            {showSessions && (
              <div className="session-dropdown" onClick={() => setShowSessions(false)}>
                <div className="session-dropdown-inner" onClick={e => e.stopPropagation()}>
                  {sessions.length === 0
                    ? <p className="session-empty">暂无历史会话</p>
                    : sessions.map(s => (
                        <div
                          key={s.sessionId}
                          className={`session-item ${s.sessionId === currentSessionId ? 'active' : ''}`}
                          onClick={() => switchSession(s.sessionId)}
                        >
                          <div className="session-item-head">
                            <span className="session-item-msg">{s.lastMessage || '(空)'}</span>
                            <span className="session-item-count">{s.messageCount}</span>
                          </div>
                          <div className="session-item-meta">
                            {new Date(s.lastActive).toLocaleString('zh-CN')}
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            )}
            <div className="chat-history">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <span>💬</span>
                <p>对话记录将显示在这里</p>
              </div>
            ) : (
              messages.map((m, i) => {
                // 找到当前 AI 消息对应的用户提问
                const userMsg = m.role === 'assistant'
                  ? messages.slice(0, i).reverse().find(x => x.role === 'user')?.content || lastMsgRef.current
                  : '';
                return (
                <div key={m.id} className={`msg-row ${m.role}`}>
                  <div className="msg-avatar">{m.role === 'user' ? '你' : 'AI'}</div>
                  <div className="msg-col">
                    <div className="msg-bubble">{cleanMd(m.content)}</div>
                    {m.citations && m.citations.length > 0 && (
                      <details className="chat-citations">
                        <summary>参考来源（{m.citations.length}）</summary>
                        <ul>
                          {m.citations.map((citation, citationIndex) => (
                            <li key={`${citation.source}-${citationIndex}`}>
                              <strong>{citation.source}</strong>
                              <span>{citation.text}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="msg-acts">
                      <button className="msg-act-btn" onClick={() => navigator.clipboard.writeText(cleanMd(m.content))}>📋 复制</button>
                      {m.role === 'user' ? (
                        <button className="msg-act-btn" onClick={() => setEditText(m.content)}>✏️ 修改</button>
                      ) : (
                        <button className="msg-act-btn" onClick={() => handleSend(userMsg)}>🔄 重新回答</button>
                      )}
                    </div>
                  </div>
                </div>
              )})
            )}
            {status === 'thinking' && !streamText && (
              <div className="msg-row assistant">
                <div className="msg-avatar">AI</div>
                <div className="msg-bubble thinking">
                  <i /><i /><i />
                </div>
              </div>
            )}
            {streamText && (
              <div className="msg-row assistant">
                <div className="msg-avatar">AI</div>
                <div className="msg-bubble">{cleanMd(streamText)}</div>
              </div>
            )}
            <div ref={messagesEndRef} />
            </div>
          </>
          )}
        </div>
      </main>

      {/* 底部控制区 */}
      <div className="controls">
        <PresetQuestions questions={getPresetQuestions(profile)} disabled={isBusy} onSelect={handleSend} />
        <InputBar disabled={isBusy} onSend={(t) => { setEditText(''); handleSend(t); }} editText={editText} />
      </div>
    </div>
  );
}
