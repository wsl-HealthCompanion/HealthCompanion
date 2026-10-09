import { useState, useRef, useCallback, useEffect } from 'react';
import DigitalHumanPlayer from './components/DigitalHumanPlayer';
import XmovAvatarPlayer from './components/XmovAvatarPlayer';
import { AVATAR_PROVIDER } from './avatar/xmovConfig';
import CameraPanel from './components/CameraPanel';
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
import { getGreeting, getPresetQuestions, getSmartChips, PRESET_PROFILE } from './presetProfile';
import type { PresetProfile } from './presetProfile';
import { DEV_SKIP_LOGIN } from './config';
import type { ChatMessage, Emotion } from './types';
import './index.scss';
import './shell.scss';

type DhStatus = 'idle' | 'thinking' | 'speaking';
type Tab = 'dh' | 'chat' | 'more' | 'profile';

/** 底部输入区上方的功能操作栏 —— 主行（最常用 5 个） */
const KB_TOOLS_MAIN = [
  { key: 'camera', ico: '📷', label: '开启摄像头', hint: '开启本地摄像头做姿态训练' },
  { key: 'train',  ico: '🏋️', label: '肩部训练',   hint: '进入姿态训练页' },
  { key: 'plan',   ico: '📋', label: '健康计划',   hint: '查看今日健康计划' },
  { key: 'med',    ico: '💊', label: '用药提醒',   hint: '查看用药与提醒' },
  { key: 'report', ico: '📈', label: '健康报告',   hint: '生成健康数据概览' },
];
/** 功能操作栏 —— 展开行 */
const KB_TOOLS_MORE = [
  { key: 'profile', ico: '👤', label: '我的档案', hint: '查看健康档案' },
  { key: 'diet',    ico: '🥗', label: '饮食建议', hint: '根据档案给出饮食建议' },
  { key: 'sleep',   ico: '😴', label: '睡眠改善', hint: '睡眠问题改善建议' },
  { key: 'visit',   ico: '🩺', label: '就诊准备', hint: '整理就诊时需要带的资料' },
  { key: 'export',  ico: '📤', label: '导出记录', hint: '导出近期健康记录' },
];

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

// 预览模式下的档案：本地没有就退回预设档案，让问候语和推荐问题有内容
function loadPreviewProfile(): PresetProfile {
  const p = loadProfile();
  return p.name ? p : PRESET_PROFILE;
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
  const [onboardingDone, setOnboardingDone] = useState(() => DEV_SKIP_LOGIN || obDone());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [subtitle, setSubtitle] = useState(() => getGreeting(DEV_SKIP_LOGIN ? loadPreviewProfile() : loadProfile()));
  const [subtitleRole, setSubtitleRole] = useState<'user' | 'assistant'>('assistant');
  const [status, setStatus] = useState<DhStatus>('idle');
  const [streamText, setStreamText] = useState('');
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const handleUnlockAudio = useCallback(() => setAudioEnabled(true), []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('dh');
  const [profile, setProfile] = useState<PresetProfile>(DEV_SKIP_LOGIN ? loadPreviewProfile : loadProfile);
  const [reOnboard, setReOnboard] = useState(false);
  const [alert, setAlert] = useState<{type:'error'|'warning'|'info'; msg:string; detail?:string}|null>(null);
  const [editText, setEditText] = useState('');
  const [loggedIn, setLoggedIn] = useState(() => DEV_SKIP_LOGIN || isLoggedIn());
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

  // ── 新的主界面交互状态 ──
  const [menuOpen, setMenuOpen] = useState(false);   // 右上角折叠菜单
  const [dockOpen, setDockOpen] = useState(true);    // 左下对话区展开/收起
  // 供"开启摄像头"工具按钮触发 CameraPanel 内部的 start()
  const camStartRef = useRef<(() => void) | null>(null);

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

  /** 底部功能操作栏的统一入口（在 handleSend 定义之后赋值，见下方 useCallback） */
  const handleToolRef = useRef<((tool: { key: string; label: string }) => void) | null>(null);
  const handleTool = useCallback((tool: { key: string; label: string }) => {
    handleToolRef.current?.(tool);
  }, []);

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
  // 字号缩放：不再依赖 rem（新版界面用的是设计稿的绝对 px 值，写死了才精确），
  // 而是暴露一个基准比例变量 --kb-scale，由 shell.scss 里所有字号 calc(设计值 * var(--kb-scale)) 消费。
  //   1) 根元素 font-size 仍设置，覆盖旧的 rem 体系（登录页 / 建档向导等）；
  //   2) --kb-scale 供主界面 px 体系使用。
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${fontSize}px`;
    // 16px 是设计基准（字号默认值），据此换算比例，四舍五入到 3 位避免抖动
    const scale = Math.round((fontSize / 16) * 1000) / 1000;
    root.style.setProperty('--kb-scale', String(scale));
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
        { message: msg, sessionId: currentSessionId || sessionId, profile: profile.profileData },
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
          onDone: (sid) => {
            if (!isCurrentConversation()) return;
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
          { message: msg, sessionId, profile: profile.profileData },
          conversationAbort.signal,
        );
        if (!isCurrentConversation()) return;
        aiEmotion = json.emotion;
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
    setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: finalContent }]);
    setTimeout(() => {
      if (conversationGenerationRef.current === conversationGeneration) setStatus('idle');
    }, 1500);
    if (conversationAbortRef.current === conversationAbort) conversationAbortRef.current = null;
  }, [isBusy, currentSessionId, sessionId, profile, useXmovAvatar]);

  // 功能操作栏真正的实现 —— 放在 handleSend 之后，避免"使用在声明之前"
  handleToolRef.current = (tool) => {
    switch (tool.key) {
      case 'camera':  camStartRef.current?.(); return;
      case 'train':   window.open('/pose-lab.html', '_blank'); return;
      case 'profile': setActiveTab('profile'); return;
      case 'plan':    void handleSend('帮我看看今天的健康计划，我该注意什么？'); return;
      case 'med':     void handleSend('我现在的用药有哪些注意事项？'); return;
      case 'report':  void handleSend('帮我总结一下我近期的健康数据情况。'); return;
      case 'diet':    void handleSend('根据我的疾病史，帮我做个饮食建议。'); return;
      case 'sleep':   void handleSend('我最近睡眠不太好，有什么改善办法？'); return;
      case 'visit':   void handleSend('我要去医院复诊，需要准备哪些材料？'); return;
      case 'export':  void handleSend('帮我把最近的健康记录整理成一份清单。'); return;
      default:        void handleSend(tool.label);
    }
  };

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
    <div className="app kb-app">
      {/* 顶部导航栏：只保留品牌标识 + 一个折叠菜单入口 */}
      <header className="kb-header">
        <div className="kb-brand">
          {DEV_SKIP_LOGIN && <span className="kb-preview-chip" title="本地预览模式：跳过登录与建档，仅用于看界面效果">预览模式</span>}
        </div>

        <div className="kb-menu-wrap">
          <button
            className={`kb-menu-btn ${menuOpen ? 'open' : ''}`}
            title="更多功能"
            aria-label="更多功能"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >⋮</button>
          {menuOpen && (
            <>
              <div className="kb-menu-mask" onClick={() => setMenuOpen(false)} />
              <div className="kb-menu-panel" role="menu">
                <div className="kb-menu-row">
                  <span className="kb-menu-label">字号</span>
                  <span className="kb-menu-scale">{Math.round((fontSize / 16) * 100)}%</span>
                  <button
                    className="kb-menu-font"
                    title="缩小字号"
                    disabled={fontSize <= 12}
                    onClick={() => { const s = Math.max(12, fontSize - 2); setFontSize(s); localStorage.setItem('yhzk_font_size', String(s)); }}
                  >A⁻</button>
                  <button
                    className="kb-menu-font"
                    title="放大字号"
                    disabled={fontSize >= 32}
                    onClick={() => { const s = Math.min(32, fontSize + 2); setFontSize(s); localStorage.setItem('yhzk_font_size', String(s)); }}
                  >A⁺</button>
                </div>
                <div className="kb-menu-sep" />
                <button className="kb-menu-item" onClick={() => { newSession(); setMenuOpen(false); }}>
                  <span className="kb-menu-ico">＋</span>新建会话
                </button>
                <button className="kb-menu-item" onClick={() => { loadSessions(); setShowSessions(true); setMenuOpen(false); }}>
                  <span className="kb-menu-ico">🕘</span>历史记录
                  {sessions.length > 0 && <span className="kb-menu-badge">{sessions.length}</span>}
                </button>
                <button
                  className={`kb-menu-item ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => { setActiveTab(activeTab === 'profile' ? 'dh' : 'profile'); setMenuOpen(false); }}
                >
                  <span className="kb-menu-ico">👤</span>我的健康档案
                </button>
                <div className="kb-menu-sep" />
                <button className="kb-menu-item danger" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                  <span className="kb-menu-ico">⏻</span>退出登录
                </button>
              </div>
            </>
          )}
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

      {/* 主体：数字人舞台 + 浮层面板 */}
      <main className="kb-stage">
        {activeTab === 'profile' ? (
          <div className="kb-profile-layer">
            <ProfilePage profile={profile} onEdit={() => { setReOnboard(true); }} />
          </div>
        ) : (
          <>
            {/* 中央：数字人（去掉地台，让人物直接站在场景里，尺寸自适应放大） */}
            <div className="kb-avatar">
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

            {/* 左上：摄像头训练（半透明毛玻璃） */}
            <CameraPanel onReady={(start) => { camStartRef.current = start; }} />

            {/* 右上：试试这样问 —— 只放快捷问题，历史对话统一在左下 */}
            <div className="kb-side">
              <div className="kb-ask">
                <div className="kb-ask-title">
                  <span className="kb-ask-dot" />试试这样问
                </div>
                <div className="kb-ask-list">
                  {getPresetQuestions(profile).map((q, i) => (
                    <button
                      key={i}
                      className="kb-ask-btn"
                      disabled={isBusy}
                      onClick={() => handleSend(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部中央：输入区 —— 智能提示条 + 功能操作栏 + 圆润大输入框 */}
            <div className="kb-composer">
              {/* 智能提示条：按档案实时生成的小蓝标建议 */}
              <div className="kb-chips">
                {getSmartChips(profile).map((c, i) => (
                  <button
                    key={i}
                    className="kb-chip"
                    disabled={isBusy}
                    onClick={() => handleSend(c.text)}
                    title={c.text}
                  >
                    <span className={`kb-chip-tag t-${c.tone}`}>{c.tag}</span>
                    <span className="kb-chip-text">{c.text}</span>
                  </button>
                ))}
              </div>

              <div className="kb-tools">
                {(activeTab === 'dh' ? KB_TOOLS_MAIN : KB_TOOLS_MORE).map(t => (
                  <button
                    key={t.key}
                    className="kb-tool"
                    disabled={isBusy}
                    title={t.hint}
                    onClick={() => handleTool(t)}
                  >
                    <span className="kb-tool-ico">{t.ico}</span>
                    <span className="kb-tool-text">{t.label}</span>
                  </button>
                ))}
                <button
                  className={`kb-tool kb-tool-more ${activeTab === 'dh' ? '' : 'on'}`}
                  onClick={() => setActiveTab(activeTab === 'dh' ? 'more' : 'dh')}
                  title={activeTab === 'dh' ? '更多功能' : '返回'}
                >
                  <span className="kb-tool-ico">{activeTab === 'dh' ? '⋯' : '‹'}</span>
                  <span className="kb-tool-text">{activeTab === 'dh' ? '更多' : '返回'}</span>
                </button>
              </div>
              <InputBar
                disabled={isBusy}
                onSend={(t) => { setEditText(''); handleSend(t); }}
                editText={editText}
              />
            </div>

            {/* 左下：对话区 —— 半透明毛玻璃、可折叠、问答区分 */}
            <div className={`kb-dock ${dockOpen ? '' : 'collapsed'}`}>
              <button
                className="kb-dock-head"
                onClick={() => setDockOpen(v => !v)}
                title={dockOpen ? '收起对话' : '展开对话'}
              >
                <span className="kb-dock-title">对话记录</span>
                {messages.length > 0 && <span className="kb-dock-count">{messages.length}</span>}
                <span className={`kb-dock-caret ${dockOpen ? 'up' : 'down'}`}>▾</span>
              </button>

              {dockOpen && (
                <div className="kb-dock-msgs">
                  {messages.length === 0 && !streamText && status !== 'thinking' && (
                    <div className="kb-dock-row assistant">
                      <div className="kb-dock-badge">答</div>
                      <div className="kb-dock-text">
                        您好，我是康伴智生。可以问我健康方面的问题，也可以点左上角「开启摄像头」做肩部训练。
                      </div>
                    </div>
                  )}

                  {messages.map((m) => (
                    <div key={m.id} className={`kb-dock-row ${m.role}`}>
                      <div className={`kb-dock-badge ${m.role === 'user' ? 'u' : 'a'}`}>
                        {m.role === 'user' ? '问' : '答'}
                      </div>
                      <div className="kb-dock-bubble">{cleanMd(m.content)}</div>
                    </div>
                  ))}

                  {status === 'thinking' && !streamText && (
                    <div className="kb-dock-row assistant">
                      <div className="kb-dock-badge a">答</div>
                      <div className="kb-dock-bubble"><span className="kb-dock-dots"><i /><i /><i /></span></div>
                    </div>
                  )}

                  {streamText && (
                    <div className="kb-dock-row assistant">
                      <div className="kb-dock-badge a">答</div>
                      <div className="kb-dock-bubble">{cleanMd(streamText)}</div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* 历史会话弹层 */}
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
    </div>
  );
}
