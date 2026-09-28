import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { ChatSession } from './chat-session.entity';
import { ChatMessage as ChatMessageEntity, MessageRole } from './chat-message.entity';
import { OrchestratorAgent } from './agents/orchestrator.agent';
import { KnowledgeQAAgent } from './agents/knowledge-qa.agent';
import { AiClientService } from './ai-client.service';
import { TTSService } from './tts/tts.service';
import { UserContext, Message } from './agents/agent.interface';
import { redisConfig, RedisKeys, RedisTTL } from '../../config/redis.config';
import { ErrorCode } from '../../common/filters/all-exceptions.filter';
import { HealthProfile } from '../onboarding/health-profile.entity';
import { User, UserStatus } from '../auth/entities/user.entity';
import {
  SSEEvent,
  SSEThinkingEvent,
  SSEIntentEvent,
  SSETokenEvent,
  SSEAudioEvent,
  SSEVisemesEvent,
  SSECitationEvent,
  SSEQuickRepliesEvent,
  SSEDoneEvent,
  SSEErrorEvent,
  Citation,
  QuickReplyItem,
} from './dto/sse-event.dto';
import {
  ChatSessionDto,
  ChatSessionsResponseDto,
  ChatMessageDto,
  ChatMessagesResponseDto,
} from './chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly orchestrator: OrchestratorAgent,
    private readonly knowledgeQA: KnowledgeQAAgent,
    private readonly ttsService: TTSService,
    private readonly configService: ConfigService,
    private readonly aiClient: AiClientService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {
    this.redis = redisConfig();
  }

  // ============================================================
  // 发送消息 (SSE 流式响应)
  // ============================================================

  async *processMessage(
    userId: string,
    sessionId: string | null,
    message: string,
    messageType: 'text' | 'quick_reply' = 'text',
    frontendProfile?: Record<string, any>, // H5 前端传来的档案
  ): AsyncGenerator<SSEEvent> {
    const now = () => Date.now();

    // 0. 确保用户存在 (demo 用户首次访问时自动创建)
    await this.getOrCreateUser(userId);

    // 1. 限流检查 (Redis不可用时跳过)
    try {
      const rateLimited = await this.checkChatRateLimit(userId);
      if (rateLimited) {
        yield {
          type: 'error',
          code: ErrorCode.CHAT_RATE_LIMITED,
          message: '消息发送过于频繁,请稍后再试',
          timestamp: now(),
        } as SSEErrorEvent;
        return;
      }
    } catch {
      // Redis 不可用,跳过限流
    }

    // 1. 获取或创建会话
    const session = await this.getOrCreateSession(userId, sessionId);

    // 2. 保存用户消息
    await this.saveMessage({
      session_id: session.session_id,
      role: MessageRole.USER,
      content: message,
    });

    // 更新会话计数
    session.message_count += 1;
    session.last_active = new Date();
    await this.sessionRepo.save(session);

    // 3. 加载用户上下文 + 对话历史
    const userContext = await this.loadUserContext(userId, frontendProfile);
    const history = await this.loadConversationHistory(session.session_id);

    // 4. 检查是否使用Python AI服务
    const aiBackend = this.configService.get<string>('AI_BACKEND', 'legacy');

    if (aiBackend === 'python') {
      const pythonHealthy = await this.aiClient.isHealthy();

      if (pythonHealthy) {
        this.logger.log(`User ${userId} routed to Python AI`);
        yield* this.processPythonAI(userId, session, message, messageType, userContext, history);
        return;
      } else {
        this.logger.warn(`Python AI unhealthy, falling back to legacy for user ${userId}`);
      }
    }

    // 5. 直达模式 — 所有消息直接生成回复（跳过 Orchestrator + Knowledge QA）
    this.logger.log(`User ${userId} using direct reply mode`);

    yield {
      type: 'thinking',
      content: '正在分析...',
      timestamp: now(),
    } as SSEThinkingEvent;

    // 直接根据用户消息生成回复（模拟 AI，用于验证 SSE 流式效果）
    const directReply = this.generateDirectReply(message, userContext);
    yield {
      type: 'intent',
      primary: 'health_question',
      confidence: 0.9,
      timestamp: now(),
    } as SSEIntentEvent;

    let finalReply = directReply.answer;
    let citations: Citation[] = [];
    let quickReplies: QuickReplyItem[] = directReply.quickReplies;

    // 8. SSE逐token流式输出 (无人工延迟 — 最快速度)
    for (let i = 0; i < finalReply.length; i++) {
      yield {
        type: 'token',
        content: finalReply[i],
        index: i,
        timestamp: now(),
      } as SSETokenEvent;
    }

    // 9. TTS + Viseme (异步，不阻塞响应 — 小程序用 LiveTalking TTS，不用这里的)
    let audioUrl: string | null = null;
    let visemeTimeline: any[] = [];
    this.ttsService.synthesize(finalReply).then(ttsResult => {
      audioUrl = ttsResult.audioUrl;
      visemeTimeline = ttsResult.visemeTimeline;
    }).catch(err => { this.logger.warn(`TTS failed: ${err}`); });

    // 10. 引用来源
    if (citations.length > 0) {
      for (const c of citations) {
        yield {
          type: 'citation',
          source: c.source,
          text: c.text,
          timestamp: now(),
        } as SSECitationEvent;
      }
    }

    // 11. 快捷回复
    if (quickReplies.length === 0) {
      quickReplies = this.generateDefaultQuickReplies('health_question');
    }
    yield {
      type: 'quick_replies',
      replies: quickReplies,
      timestamp: now(),
    } as SSEQuickRepliesEvent;

    // 12. 保存 AI 回复
    const messageId = `msg_${now()}`;
    await this.saveMessage({
      session_id: session.session_id,
      role: MessageRole.ASSISTANT,
      content: finalReply,
      intent: "health_question",
      confidence: 0.9,
      emotion: "neutral",
      citations: citations as any,
      tts_url: audioUrl,
      viseme_data: visemeTimeline as any,
      quick_replies: quickReplies as any,
    });

    // 更新会话计数
    session.message_count += 1;
    session.last_active = new Date();
    await this.sessionRepo.save(session);

    // 13. 更新 Redis 上下文缓存
    await this.updateSessionContext(
      userId,
      session.session_id,
      message,
      finalReply,
    );

    // 14. 完成
    yield {
      type: 'done',
      messageId,
      sessionId: session.session_id,
      emotion: "neutral",
      intent: "health_question",
      timestamp: now(),
    } as SSEDoneEvent;
  }

  // ============================================================
  // 获取历史会话列表
  // ============================================================

  async getSessions(userId: string): Promise<ChatSessionsResponseDto> {
    const sessions = await this.sessionRepo.find({
      where: { user_id: userId },
      order: { last_active: 'DESC' },
      take: 50,
    });

    const items: ChatSessionDto[] = await Promise.all(
      sessions.map(async (s) => {
        const lastMsg = await this.messageRepo.findOne({
          where: { session_id: s.session_id },
          order: { created_at: 'DESC' },
        });

        return {
          sessionId: s.session_id,
          lastMessage: lastMsg?.content?.substring(0, 50) || '',
          lastActive: s.last_active.toISOString(),
          messageCount: s.message_count,
          contextLevel: s.context_level,
        };
      }),
    );

    return { items, total: items.length };
  }

  // ============================================================
  // 获取会话历史消息
  // ============================================================

  async getMessages(
    userId: string,
    sessionId: string,
    before?: string,
    limit: number = 50,
  ): Promise<ChatMessagesResponseDto> {
    // 验证会话属于当前用户
    const session = await this.sessionRepo.findOne({ where: { session_id: sessionId } });
    if (!session || session.user_id !== userId) {
      return { items: [] }; // 不是自己的会话 → 返回空
    }
    const where: any = { session_id: sessionId };
    if (before) {
      where.created_at = { $lt: new Date(before) };
    }

    const messages = await this.messageRepo.find({
      where: { session_id: sessionId },
      order: { created_at: 'ASC' },
      take: limit,
    });

    const items: ChatMessageDto[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      intent: m.intent || undefined,
      citations: m.citations || undefined,
      createdAt: m.created_at.toISOString(),
    }));

    return { items };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 确保用户存在 — demo 用户首次访问时自动在 users 表创建记录
   */
  private async getOrCreateUser(userId: string): Promise<void> {
    try {
      const existing = await this.userRepo.findOne({ where: { id: userId } });
      if (!existing) {
        const user = this.userRepo.create({
          id: userId,
          status: UserStatus.REGISTERED,
        });
        await this.userRepo.save(user);
        this.logger.log(`Auto-created user ${userId}`);
      }
    } catch (e) {
      this.logger.warn(`Failed to get-or-create user ${userId}: ${e}`);
    }
  }

  private async getOrCreateSession(
    userId: string,
    sessionId?: string | null,
  ): Promise<ChatSession> {
    // 如果有 sessionId，必须验证属于当前用户
    if (sessionId) {
      const existing = await this.sessionRepo.findOne({
        where: { session_id: sessionId },
      });
      if (existing) {
        if (existing.user_id !== userId) {
          // 不是自己的会话 → 忽略，创建新会话
          this.logger.warn(`User ${userId} tried to access session ${sessionId} owned by ${existing.user_id}`);
        } else {
          return existing;
        }
      }
    }

    // 如果客户端传了 sessionId 但数据库中不存在,使用客户端传来的 ID
    const newSessionId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session = this.sessionRepo.create({
      user_id: userId,
      session_id: newSessionId,
      context_level: 'new',
      last_active: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    return this.sessionRepo.save(session);
  }

  private async saveMessage(data: Partial<ChatMessageEntity>): Promise<void> {
    const msg = this.messageRepo.create(data as any);
    await this.messageRepo.save(msg);
  }

  private async loadUserContext(userId: string, frontendProfile?: Record<string, any>): Promise<UserContext> {
    // 1. 前端档案是实时数据源 — 立即使用（同时异步存 DB）
    if (frontendProfile && Object.keys(frontendProfile).length > 0) {
      try {
        const summary = this.profileToSummary(frontendProfile);
        if (summary && summary.length > 3 && !summary.includes('未建档')) {
          this.syncProfileToDb(userId, frontendProfile).catch(() => {});
          return { user_id: userId, profile_summary: summary, scene_mode: this.getSceneMode() };
        }
      } catch { /* ignore */ }
    }

    // 2. Redis 缓存
    try {
      const cached = await this.redis.get(RedisKeys.USER_PROFILE(userId));
      if (cached) {
        const p = JSON.parse(cached);
        if (p.profile_summary && p.profile_summary !== '未建档') {
          return { user_id: userId, profile_summary: p.profile_summary, scene_mode: this.getSceneMode() };
        }
      }
    } catch { /* ignore */ }

    // 3. PostgreSQL
    try {
      const rows: any[] = await this.entityManager.query(
        `SELECT profile_data FROM health_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
      if (rows?.length > 0 && rows[0].profile_data) {
        const pd = typeof rows[0].profile_data === 'string' ? JSON.parse(rows[0].profile_data) : rows[0].profile_data;
        const summary = this.profileToSummary(pd);
        if (summary && summary.length > 3) {
          try { await this.redis.setex(RedisKeys.USER_PROFILE(userId), 3600, JSON.stringify({ profile_summary: summary })); } catch { /* */ }
          return { user_id: userId, profile_summary: summary, scene_mode: this.getSceneMode() };
        }
      }
    } catch (e) { this.logger.warn(`Failed to load profile from DB: ${e}`); }

    // 4. 兜底
    return { user_id: userId, profile_summary: '未建档', scene_mode: this.getSceneMode() };
  }

  /**
   * 异步同步档案到 PostgreSQL + Redis — 确保长期记忆不丢失
   */
  private async syncProfileToDb(userId: string, profileData: Record<string, any>): Promise<void> {
    try {
      const summary = this.profileToSummary(profileData);
      if (!summary || summary.length < 3) return;

      // 写入/更新 health_profiles 表
      await this.entityManager.query(
        `INSERT INTO health_profiles (user_id, profile_data) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET profile_data = $2`,
        [userId, JSON.stringify(profileData)],
      );

      // 更新 Redis 缓存
      try {
        await this.redis.setex(
          RedisKeys.USER_PROFILE(userId), 3600,
          JSON.stringify({ profile_summary: summary }),
        );
      } catch { /* ignore */ }
    } catch (e) {
      this.logger.warn(`Failed to sync profile to DB: ${e}`);
    }
  }

  /**
   * L2 中期记忆 — 从会话表读取最近2条摘要
   */
  private async loadSessionMemories(sessionId: string): Promise<string[]> {
    try {
      const session = await this.sessionRepo.findOne({ where: { session_id: sessionId } });
      if (!session?.memory_summaries?.length) return [];
      // 取最近 2 条
      return session.memory_summaries.slice(-2).map(m => m.summary);
    } catch {
      return [];
    }
  }

  /**
   * L2 中期记忆 — 触发条件检查 + 调用 Python 摘要
   */
  private async triggerMemorySummary(
    session: ChatSession,
    history: Message[],
  ): Promise<void> {
    const total = session.message_count;
    const lastSummaryCount = session.memory_summaries?.length
      ? session.memory_summaries[session.memory_summaries.length - 1].msgCount
      : 0;
    const newMsgs = total - lastSummaryCount;

    // 语义触发: 4条新消息 OR 上下文超过2000字
    const contextLength = history.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (newMsgs < 4 && contextLength < 2000) return;

    this.logger.log(`[Memory] Triggering summary for ${session.session_id} (total=${total}, new=${newMsgs})`);

    try {
      const aiUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
      const resp = await axios.post(`${aiUrl}/v1/memory/summarize`, {
        conversation_history: history.slice(-20),
      }, { timeout: 15000 });

      const summary = resp.data?.memory_summary;
      if (!summary?.summary) return;

      const entry = {
        summary: summary.summary,
        keyTopics: summary.keyTopics || [],
        createdAt: new Date().toISOString(),
        msgCount: total,
      };

      // 写 DB
      const summaries = session.memory_summaries || [];
      summaries.push(entry);
      session.memory_summaries = summaries;
      await this.sessionRepo.save(session);

      // 缓存 Redis
      try {
        await this.redis.setex(
          `memory:${session.user_id}:${session.session_id}`,
          3600,
          JSON.stringify(summaries.slice(-2)),
        );
      } catch { /* ignore */ }

      this.logger.log(`[Memory] Summary saved: ${entry.keyTopics.join(', ')}`);
    } catch (e) {
      this.logger.warn(`[Memory] Summary failed: ${e}`);
    }
  }

  /** 把 profile_data JSON 转成一句话摘要给 AI (覆盖 step1 ~ step3c) */
  private profileToSummary(pd: Record<string, any>): string {
    const parts: string[] = [];
    const s1 = pd['step1'] || {};
    if (s1.name) parts.push(`姓名:${s1.name}`);
    if (s1.gender) parts.push(s1.gender === 'male' ? '男' : '女');
    if (s1.birthDate) {
      const age = Math.floor((Date.now() - new Date(s1.birthDate).getTime()) / (365.25*24*3600*1000));
      parts.push(`${age}岁`);
    }
    if (s1.height) parts.push(`${s1.height}cm`);
    if (s1.weight) parts.push(`${s1.weight}kg`);

    const extractNames = (data: any, field: string): string[] => {
      if (!data) return [];
      const arr = data[field];
      if (!Array.isArray(arr)) return [];
      return arr.map((x: any) => x.name || x).filter(Boolean);
    };

    const diseases = extractNames(pd['step2a'], 'diseases');
    if (diseases.length) parts.push(`病史:${diseases.join('、')}`);

    const allergies = extractNames(pd['step2b'], 'allergies');
    if (allergies.length) parts.push(`过敏:${allergies.join('、')}`);

    const meds = extractNames(pd['step2c'], 'medications');
    if (meds.length) parts.push(`用药:${meds.join('、')}`);

    // step3a 饮食偏好
    const diet = pd['step3a'];
    if (diet) {
      const dietParts: string[] = [];
      if (typeof diet === 'object') {
        for (const [k, v] of Object.entries(diet)) {
          if (v && typeof v === 'string' && v.length > 0) dietParts.push(v);
        }
      }
      if (dietParts.length > 0) parts.push(`饮食:${dietParts.join('、')}`);
    }

    // step3b 运动习惯
    const exercise = pd['step3b'];
    if (exercise && typeof exercise === 'object') {
      const exParts: string[] = [];
      for (const [k, v] of Object.entries(exercise)) {
        if (v && typeof v === 'string' && v.length > 0) exParts.push(v);
      }
      if (exParts.length > 0) parts.push(`运动:${exParts.join('、')}`);
    }

    // step3c 睡眠+烟酒
    const sleep = pd['step3c'];
    if (sleep && typeof sleep === 'object') {
      const sleepParts: string[] = [];
      for (const [k, v] of Object.entries(sleep)) {
        if (v && typeof v === 'string' && v.length > 0) sleepParts.push(v);
      }
      if (sleepParts.length > 0) parts.push(`睡眠/生活习惯:${sleepParts.join('、')}`);
    }

    return parts.length > 0 ? parts.join('; ') : '';
  }

  private async loadConversationHistory(sessionId: string): Promise<Message[]> {
    const messages = await this.messageRepo.find({
      where: { session_id: sessionId },
      order: { created_at: 'DESC' },
      take: 10,
    });

    return messages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      timestamp: m.created_at.toISOString(),
    }));
  }

  private async updateSessionContext(
    userId: string,
    sessionId: string,
    userMsg: string,
    aiReply: string,
  ): Promise<void> {
    try {
      const key = RedisKeys.CONTEXT(userId, sessionId);
      const context = {
        last_user_message: userMsg,
        last_ai_reply: aiReply,
        updated_at: new Date().toISOString(),
      };
      await this.redis.setex(key, RedisTTL.CONTEXT, JSON.stringify(context));
    } catch {
      // ignore
    }
  }

  private async checkChatRateLimit(userId: string): Promise<boolean> {
    const key = RedisKeys.CHAT_RATE(userId);
    const exists = await this.redis.get(key);
    if (exists) return true;

    await this.redis.setex(key, RedisTTL.CHAT_RATE, '1');
    return false;
  }

  private getSceneMode(): string {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 9) return 'morning';
    if (hour >= 9 && hour < 18) return 'day';
    if (hour >= 18 && hour < 22) return 'night';
    return 'late_night';
  }

  private async *faqMode(message: string): AsyncGenerator<SSEEvent> {
    const faqAnswer = '我暂时无法处理这个问题。请稍后再试,或联系你的健康顾问获取帮助。';
    for (const char of faqAnswer) {
      yield { type: 'token', content: char, index: 0, timestamp: Date.now() } as SSETokenEvent;
      await this.delay(30);
    }
    yield {
      type: 'done',
      messageId: `faq_${Date.now()}`,
      emotion: 'neutral',
      timestamp: Date.now(),
    } as SSEDoneEvent;
  }

  /**
   * 直达回复 — 跳过 Agent 路由，直接生成健康建议
   * 用于验证 SSE 流式效果，后续可替换为真实 DeepSeek 调用
   */
  private generateDirectReply(message: string, _userContext: UserContext): {
    answer: string;
    quickReplies: QuickReplyItem[];
  } {
    const t = message.toLowerCase();
    const profile = _userContext.profile_summary || '';

    // 健康关键词 → 生成详细的模拟 AI 回答
    const replies: Record<string, string> = {
      '血压': '血压管理要注意四点：低盐饮食（每天<5克盐）、每天快走30分钟、每周监测2-3次血压、按时服降压药不自行停药。你最近一次测的血压是多少？',
      '血糖': '血糖控制关键是管住嘴迈开腿：每餐主食不超过拳头大小、餐后散步20分钟、空腹血糖控制在4.4-7.0mmol/L。你目前空腹血糖大概在什么范围？',
      '饮食': '健康饮食记住这几点：每天盐不超过5克（一个啤酒瓶盖）、主食粗细搭配、蔬菜每天500克、选鱼肉鸡胸等低脂蛋白、多用蒸煮少煎炸。有特别口味偏好吗？',
      '运动': '推荐快走每天30分钟，每周至少5天；太极每周3-4次对降压有帮助。饭后1小时运动效果最好，运动前热身5-10分钟。你平时有运动习惯吗？',
      '睡眠': '改善睡眠可以试试这些方法：固定作息时间、睡前1小时远离手机、卧室温度18-22℃、试试4-7-8呼吸法（吸4秒→屏7秒→呼8秒）。你最近睡得怎么样？',
      '用药': '用药注意：严格按时按量服药、了解每种药的作用和副作用、做好服药记录防止漏服、定期复查调整方案。你目前在服用什么药？',
    };

    // 匹配关键词
    let answer = '';
    for (const [key, reply] of Object.entries(replies)) {
      if (t.includes(key)) { answer = reply; break; }
    }

    if (!answer) {
      answer = `你好！${profile ? `根据你的档案（${profile}），请告诉我你想了解什么。` : '请先完成建档，我会更准确地为你服务。'}可以问我血压、血糖、饮食、运动、睡眠、用药等问题。`;
    }

    return {
      answer,
      quickReplies: [
        { label: '血压怎么控制', icon: '🩺', score: 0.95 },
        { label: '饮食建议', icon: '🥗', score: 0.9 },
        { label: '运动指导', icon: '🏃', score: 0.85 },
        { label: '睡眠改善', icon: '😴', score: 0.8 },
      ],
    };
  }

  private generateDefaultQuickReplies(intent: string): QuickReplyItem[] {
    const defaults: Record<string, QuickReplyItem[]> = {
      health_question: [
        { label: '查看血压趋势', icon: 'heart', score: 0.95 },
        { label: '了解更多', icon: 'book', score: 0.8 },
        { label: '联系顾问', icon: 'user', score: 0.7 },
      ],
      general_chat: [
        { label: '查看健康档案', icon: 'file', score: 0.9 },
        { label: '健康知识', icon: 'book', score: 0.8 },
      ],
      emergency: [
        { label: '拨打120', icon: 'phone', score: 1.0 },
      ],
    };

    return defaults[intent] || defaults['general_chat'] || [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================
  // Python AI 流程 (新增)
  // ============================================================

  private async *processPythonAI(
    userId: string,
    session: ChatSession,
    message: string,
    messageType: 'text' | 'quick_reply',
    userContext: UserContext,
    history: Message[],
  ): AsyncGenerator<SSEEvent> {
    const now = () => Date.now();
    let accumulatedReply = '';
    let lastIntent: string | undefined;
    let lastEmotion = 'neutral';
    // Task 4：Python citation 事件会自动透传（非 done 全透传），
    // 这里额外累积，回答完成后随 ChatMessage 持久化（历史消息可恢复引用卡片）
    let citations: Citation[] = [];

    // L2 中期记忆 — 加载最近摘要注入上下文
    const recentMemories = await this.loadSessionMemories(session.session_id);

    try {
      // 调用Python AI服务的SSE流
      for await (const event of this.aiClient.streamChat({
        user_message: message,
        message_type: messageType,
        conversation_history: history,
        user_context: userContext,
        scene_mode: this.getSceneMode(),
        downgrade_level: 'none',
        recent_intents: [],
        recent_memories: recentMemories,
      })) {
        // 累积token用于TTS
        if (event.type === 'token') {
          accumulatedReply += event.content;
        }

        // 记录意图和情绪
        if (event.type === 'intent') {
          lastIntent = event.primary;
        }

        // Task 4：累积可信引用（仅来自 Python 检索 metadata）
        if (event.type === 'citation') {
          const c = event as SSECitationEvent;
          if (citations.length < 3) {
            citations.push({
              source: c.source,
              title: c.title,
              url: c.url,
              publisher: c.publisher,
              text: c.text,
              chunk_id: c.chunk_id,
            });
          }
        }

        if (event.type === 'done') {
          lastEmotion = event.emotion || 'neutral';
          lastIntent = event.intent || lastIntent;
        }

        // 透传所有事件给小程序(除了done,稍后补充TTS后再发)
        if (event.type !== 'done') {
          yield event;
        }
      }

      // 补充TTS + Viseme (Python不做,NestJS补)
      let audioUrl: string | null = null;
      let visemeTimeline: any[] = [];

      if (accumulatedReply) {
        try {
          const ttsResult = await this.ttsService.synthesize(accumulatedReply);
          audioUrl = ttsResult.audioUrl;
          visemeTimeline = ttsResult.visemeTimeline;

          yield {
            type: 'audio',
            url: audioUrl,
            duration: ttsResult.durationSec,
            timestamp: now(),
          } as SSEAudioEvent;

          yield {
            type: 'visemes',
            data: visemeTimeline,
            timestamp: now(),
          } as SSEVisemesEvent;
        } catch (err) {
          this.logger.warn(`TTS failed in Python AI flow: ${err}`);
        }
      }

      // 保存assistant消息
      const messageId = `msg_${now()}`;
      await this.saveMessage({
        session_id: session.session_id,
        role: MessageRole.ASSISTANT,
        content: accumulatedReply,
        intent: lastIntent,
        tts_url: audioUrl,
        viseme_data: visemeTimeline as any,
        citations: (citations.length > 0 ? citations : undefined) as any,
      });

      // 更新会话
      session.message_count += 1;
      session.last_active = new Date();
      await this.sessionRepo.save(session);

      // L2 中期记忆 — 条件触发摘要(异步,不阻塞响应)
      this.triggerMemorySummary(session, history).catch(e =>
        this.logger.warn(`Memory summary trigger failed: ${e}`),
      );

      // 更新Redis上下文
      await this.updateSessionContext(
        userId,
        session.session_id,
        message,
        accumulatedReply,
      );

      // 最后发送done事件
      yield {
        type: 'done',
        messageId,
        sessionId: session.session_id,
        emotion: lastEmotion,
        intent: lastIntent,
        timestamp: now(),
      } as SSEDoneEvent;

    } catch (error) {
      this.logger.error(`Python AI flow failed: ${error}`);

      // 错误降级到FAQ
      yield {
        type: 'error',
        code: ErrorCode.AI_TIMEOUT,
        message: 'AI服务暂时不可用,已切换FAQ模式',
        timestamp: now(),
      } as SSEErrorEvent;

      yield* this.faqMode(message);
    }
  }
}
