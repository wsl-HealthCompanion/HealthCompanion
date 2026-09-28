// 炎华众康 · AI 对话开发服务器（最小化，零数据库依赖）
// 用法: node dev-server.js
// 端点: POST http://localhost:3001/api/v1/chat/message (SSE 流式)
//       GET  http://localhost:3001/api/v1/health
// ============================================================
const http = require('http');
const fs = require('fs');

// ── 读取 .env ──
function loadEnv() {
  const envPath = __dirname + '/.env';
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const PORT = 3001; // 固定端口，不受 .env PORT 影响

if (!DEEPSEEK_KEY || DEEPSEEK_KEY.startsWith('sk-dev')) {
  console.error('\n❌ DeepSeek API Key 未配置!');
  console.error('   请编辑 .env 文件，将 DEEPSEEK_API_KEY=sk-dev-... 改为真实 Key\n');
  process.exit(1);
}

// ── AI Agent 实现 ──
async function callDeepSeek(messages, stream = false) {
  const body = JSON.stringify({
    model: 'deepseek-chat',      // DeepSeek-V3
    messages,
    temperature: 0.3,
    max_tokens: 1024,
    stream,
  });

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
    },
    body,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${err}`);
  }
  return res;
}

// ── 构建 System Prompt ──
function buildProfileSection(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const s1  = profile.step1  || {};
  const s2a = profile.step2a || {};
  const s2b = profile.step2b || {};
  const s2c = profile.step2c || {};
  const s3a = profile.step3a || {};
  const s3b = profile.step3b || {};
  const s3c = profile.step3c || {};
  const lines = ['## 当前用户健康档案'];
  if (s1.name)      lines.push(`- 姓名：${s1.name}`);
  if (s1.gender)    lines.push(`- 性别：${s1.gender === 'male' ? '男' : '女'}`);
  if (s1.birthDate) lines.push(`- 出生日期：${s1.birthDate}`);
  if (s1.height)    lines.push(`- 身高：${s1.height}cm`);
  if (s1.weight)    lines.push(`- 体重：${s1.weight}kg`);
  if (s2a.diseases?.length)     lines.push(`- 慢性病：${s2a.diseases.join('、')}`);
  if (s2b.allergies?.length)    lines.push(`- 过敏史：${s2b.allergies.join('、')}`);
  if (s2c.medications?.length)  lines.push(`- 用药：${s2c.medications.map(m => m.name || m).join('、')}`);
  if (s3a.dietType)  lines.push(`- 饮食习惯：${s3a.dietType}`);
  if (s3b.exerciseFreq) lines.push(`- 运动频率：${s3b.exerciseFreq}`);
  if (s3c.sleepHours)   lines.push(`- 睡眠时长：${s3c.sleepHours}小时`);
  return lines.length > 1 ? lines.join('\n') : '';
}

function buildSystemPrompt(userMessage, profile) {
  const profileSection = buildProfileSection(profile);
  return `你是炎华众康主动健康管理系统的AI健康管家"小炎"。

## 你的角色
- 温暖耐心、通俗易懂，服务对象是40-80岁慢病患者
- 基于医学知识给出建议，涉及用药/治疗必须追加"具体请咨询健康顾问"
- 回复控制在80-150字，简洁有温度
- 用户询问"档案""我的信息""我的情况"时，结合下方档案回答${profileSection ? '\n\n' + profileSection : '（用户暂未填写健康档案）'}

## 用户消息
${userMessage}

## 输出格式 (严格JSON)
{
  "intent": "health_question|general_chat|emergency",
  "confidence": 0.0-1.0,
  "emotion": "neutral|happy|concerned",
  "answer": "你的回复内容",
  "quickReplies": ["快捷回复1", "快捷回复2", "快捷回复3"],
  "citations": [{"source":"来源", "text":"引用内容"}]
}`;
}

// ── SSE 事件发送 ──
function sendSSE(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── 处理聊天消息 ──
async function handleChat(req, res) {
  // 读取请求体
  let body = '';
  for await (const chunk of req) { body += chunk; }
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = {}; }
  const message = parsed.message || '';

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  try {
    // 1. thinking 事件
    sendSSE(res, { type: 'thinking', content: '正在分析你的问题...', timestamp: Date.now() });

    // 2. 调用 DeepSeek
    const systemPrompt = buildSystemPrompt(message);
    const aiRes = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ], false);

    const data = await aiRes.json();
    const aiContent = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try { parsed = JSON.parse(aiContent); } catch { parsed = { answer: aiContent, intent: 'general_chat', emotion: 'neutral' }; }

    const answer = parsed.answer || '抱歉，我暂时无法回答这个问题，请稍后再试。';
    const intent = parsed.intent || 'general_chat';
    const emotion = parsed.emotion || 'neutral';
    const citations = parsed.citations || [];
    const quickReplies = parsed.quickReplies || ['健康咨询', '用药提醒', '今日计划'];

    // 3. intent 事件
    sendSSE(res, { type: 'intent', primary: intent, confidence: parsed.confidence || 0.8, timestamp: Date.now() });

    // 4. emotion 事件
    sendSSE(res, { type: 'emotion', detected: emotion, timestamp: Date.now() });

    // 5. token 流式（逐字发送）
    for (let i = 0; i < answer.length; i++) {
      sendSSE(res, { type: 'token', content: answer[i], index: i, timestamp: Date.now() });
      // 流式延迟（模拟真实的逐字输出感）
      await new Promise(r => setTimeout(r, 20 + Math.random() * 15));
    }

    // 6. citations
    for (const c of citations) {
      sendSSE(res, { type: 'citation', source: c.source, text: c.text, timestamp: Date.now() });
    }

    // 7. quick_replies
    const replies = quickReplies.map((label, i) => ({
      label,
      icon: ['📋', '💊', '🩺', '🥗', '👨‍⚕️', '📈', '🏃'][i % 7],
    }));
    sendSSE(res, { type: 'quick_replies', replies, timestamp: Date.now() });

    // 8. done
    sendSSE(res, {
      type: 'done',
      messageId: `msg_${Date.now()}`,
      sessionId: parsed.sessionId || `sess_${Date.now()}`,
      emotion,
      intent,
      timestamp: Date.now(),
    });

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    // 降级为本地回复
    const fallback = getLocalFallback(message);
    for (let i = 0; i < fallback.length; i++) {
      sendSSE(res, { type: 'token', content: fallback[i], index: i, timestamp: Date.now() });
      await new Promise(r => setTimeout(r, 25));
    }
    sendSSE(res, { type: 'done', messageId: `msg_fb_${Date.now()}`, emotion: 'neutral', timestamp: Date.now() });
  }

  res.end();
}

// ── 本地降级回复 ──
function getLocalFallback(msg) {
  if (msg.includes('血压')) return '血压管理建议：低盐饮食（每日<5g盐）、按时服药、每周监测2-3次。你的目标是将收缩压控制在140以下。具体请咨询健康顾问。';
  if (msg.includes('血糖') || msg.includes('糖尿病')) return '血糖控制建议：控制主食摄入（每餐拳头大小）、餐后散步20分钟、按时服用降糖药。空腹血糖目标4.4-7.0mmol/L。具体请咨询健康顾问。';
  if (msg.includes('运动') || msg.includes('锻炼')) return '推荐运动：快走（每天30分钟）、太极（每周3-4次）。餐后1小时是最佳运动时间。运动前热身5-10分钟，如有不适应立即停止。';
  if (msg.includes('不舒服') || msg.includes('疼')) return '听到你不舒服我很关切。能说一下具体是哪里不舒服吗？如果症状严重，请立即联系你的健康顾问或拨打120。';
  return '好的，我了解了。有什么健康问题可以随时问我，我会尽力帮助你～';
}

// ── 简单 JSON 聊天（小程序用，无 SSE） ──
async function handleChatSimple(req, res) {
  let body = '';
  for await (const chunk of req) { body += chunk; }
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = {}; }
  const message = parsed.message || '';
  const profile = parsed.profile || null;

  try {
    const systemPrompt = buildSystemPrompt(message, profile);
    const aiRes = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ], false);

    const data = await aiRes.json();
    const aiContent = data.choices?.[0]?.message?.content || '{}';
    let result;
    try { result = JSON.parse(aiContent); } catch { result = { answer: aiContent, intent: 'general_chat', emotion: 'neutral' }; }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      code: 0,
      data: {
        answer: result.answer || '抱歉，我暂时无法回答。',
        intent: result.intent || 'general_chat',
        emotion: result.emotion || 'neutral',
        confidence: result.confidence || 0.8,
        quickReplies: (result.quickReplies || ['健康咨询', '用药提醒', '今日计划']).map((label, i) => ({
          label, icon: ['📋','💊','🩺','🥗','👨‍⚕️','📈','🏃'][i % 7]
        })),
        citations: result.citations || [],
      }
    }));
  } catch (err) {
    console.error('[Chat-Simple] Error:', err.message);
    const fallback = getLocalFallback(message);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      code: 0,
      data: {
        answer: fallback,
        intent: 'general_chat',
        emotion: 'neutral',
        confidence: 0.5,
        quickReplies: [{ label: '健康咨询', icon: '💬' }, { label: '用药提醒', icon: '💊' }, { label: '咨询顾问', icon: '👨‍⚕️' }],
        citations: [],
      }
    }));
  }
}

// ── HTTP 服务器 ──
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 健康检查
  if (req.method === 'GET' && url.pathname === '/api/v1/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      deepseek: DEEPSEEK_KEY ? 'configured' : 'missing',
      mode: 'dev-server-minimal',
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // 聊天端点 (SSE)
  if (req.method === 'POST' && url.pathname === '/api/v1/chat/message') {
    await handleChat(req, res);
    return;
  }

  // 聊天端点 (简单 JSON — 小程序用，不需要 SSE)
  if (req.method === 'POST' && url.pathname === '/api/v1/chat/simple') {
    await handleChatSimple(req, res);
    return;
  }

  // 建档提交端点 — 返回顾问匹配结果（阻止 demo 降级清空本地档案）
  if (req.method === 'POST' && url.pathname === '/api/v1/onboarding/profile/submit') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      code: 0,
      data: {
        profileId: `dev_profile_${Date.now()}`,
        advisorId: 'demo_advisor_001',
        advisorName: '李慧敏',
        matchScore: 87,
        matchDimensions: { disease: 85, region: 90, load: 70, random: 42 },
      }
    }));
    return;
  }

  // 建档步骤保存端点 — 静默成功
  if (req.method === 'PUT' && url.pathname.startsWith('/api/v1/onboarding/profile/step/')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ code: 0, data: { success: true } }));
    return;
  }

  // 健康档案查询端点
  if (req.method === 'GET' && url.pathname === '/api/v1/onboarding/profile') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ code: 0, data: { profileData: {}, skippedSteps: [] } }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 10005, message: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  炎华众康 · AI 对话开发服务器                      ║
║  端口: ${PORT}                                      ║
║  模型: DeepSeek-V3 (deepseek-chat)                ║
║  端点: POST http://localhost:${PORT}/api/v1/chat/message ║
║        GET  http://localhost:${PORT}/api/v1/health        ║
╚══════════════════════════════════════════════════╝
`);
});
