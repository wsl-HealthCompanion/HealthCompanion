/**
 * ============================== 代码导读 ==============================
 *
 * 一、这个文件做什么
 *
 * 本文件是前端数字人会话服务的“对外门面”。页面不直接处理 HTTP 请求、心跳、
 * 控制令牌等底层细节，而是通过文件末尾导出的 digitalHuman 对象完成以下操作：
 *
 * 1. connect / disconnect：建立或关闭当前用户的数字人会话；
 * 2. snapshot / subscribe：读取会话快照，或监听快照变化；
 * 3. capture：取得与当前会话绑定的操作能力，防止旧请求影响新会话；
 * 4. speak / interrupt：让数字人播报文本或打断正在播放的内容；
 * 5. pollSubtitleEvents：按照事件 ID 增量获取字幕；
 * 6. onAuthenticationLost：登录凭证失效时通知页面执行退出处理。
 *
 * 真正的网络请求、心跳定时器和会话失效恢复位于 digitalHumanSession.ts。
 * 本文件主要负责类型收窄、输入整理、事件转发和异常降级。
 *
 * 二、主要执行流程
 *
 * 页面调用 connect()
 *   -> 底层客户端创建会话并产生快照
 *   -> onSnapshot 把快照通知给所有订阅者
 *   -> 页面调用 capture() 保存当前会话能力
 *   -> speak() 先检查能力是否仍有效，再打断旧语音并发送新文本
 *   -> pollSubtitleEvents() 持续读取这轮播报产生的字幕事件
 *   -> 页面离开或用户退出时调用 disconnect() / invalidate()
 *
 * 三、本文件使用的 TypeScript / JavaScript 语法
 *
 * 1. import / export：ES Module 模块语法。import 引入其他文件导出的成员，
 *    export 让当前文件的类型或对象能被其他模块使用；导入列表中带 `type` 标记的
 *    成员只参与类型检查，编译成 JavaScript 后会被移除。
 *
 * 2. interface：TypeScript 的对象结构声明，例如 SubtitleEvent 规定一个字幕事件
 *    必须包含哪些字段及其类型。interface 只用于编译期检查，不生成运行时代码。
 *
 * 3. 类型标注：`名称: 类型` 用来限定变量、参数、属性或返回值，例如
 *    `text: string` 表示 text 必须是字符串，`connect(): Promise<...>` 表示
 *    connect 返回异步结果。
 *
 * 4. 可选属性与默认参数：`interrupt?: boolean` 中的 `?` 表示属性可以不传；
 *    `opts = {}` 和 `after = 0` 表示调用方省略参数时采用指定默认值。
 *
 * 5. 联合类型与数组类型：`Snapshot | null` 表示值可能是快照，也可能为空；
 *    `SubtitleEvent[]` 表示由 SubtitleEvent 对象组成的数组。
 *
 * 6. 泛型：`Set<监听函数类型>`、`Promise<void>` 中的尖括号用于指定容器或
 *    异步结果内部的类型。void 表示没有需要使用的返回值，unknown 表示返回值
 *    类型未知，使用前必须先判断类型。
 *
 * 7. 函数类型与箭头函数：`() => boolean` 描述“无参数、返回布尔值”的函数；
 *    `(snapshot) => { ... }` 创建一个箭头函数。subscribe 返回的箭头函数还是
 *    一个闭包，它会记住 listener，供调用方以后取消订阅。
 *
 * 8. 对象字面量与方法简写：`{ apiBase: API_BASE }` 创建对象；当属性名和变量名
 *    相同时可以简写成 `{ getToken }`；`async speak(...) {}` 是对象方法简写。
 *
 * 9. async / await / Promise：async 声明异步函数，并保证其返回 Promise；
 *    await 等待异步操作完成，使“先打断、再播报”的执行顺序更清晰。
 *
 * 10. 条件语法：`!value` 表示逻辑取反，`A || B` 表示 A 不成立时使用 B，
 *     `条件 ? A : B` 是三元表达式，适合在两个值之间选择。
 *
 * 11. 类型断言：`value as SubtitleEvent[]` 告诉编译器按指定类型理解结果，
 *     但它不会在运行时校验后端数据，因此不能代替真正的数据验证。
 *
 * 12. Set 与 for...of：Set 是元素不重复的集合，这里用于保存监听函数；
 *     for...of 逐个遍历集合并调用监听函数。
 *
 * 13. try / catch：捕获异步请求异常。字幕轮询失败时返回空数组，避免一次短暂
 *     网络错误终止页面的整个对话流程。
 * ======================================================================
 */

import { API_BASE } from '../config';
import { getToken } from './auth';
import {
  createDigitalHumanSessionClient,
  type DigitalHumanSessionCapability,
  type DigitalHumanSessionSnapshot,
} from './digitalHumanSession';

/**
 * 一段可供 TTS（文本转语音）及字幕系统使用的文本。
 *
 * index 保存片段顺序，text 保存需要显示和播报的实际内容。
 */
export interface SubtitleSegment {
  index: number;
  text: string;
}

/** 后端字幕轮询接口返回的单条事件。 */
export interface SubtitleEvent {
  // 递增事件 ID。下一次轮询会把它作为 after 参数，从而避免重复获取旧事件。
  eventId: number;
  // 事件状态，例如页面实际处理的 "subtitle"。
  status: string;
  // 当前事件属于本轮回答中的第几个文本片段。
  fragmentIndex: number;
  subtitleText: string;
  // 字幕相对音频的时间偏移，具体单位由后端协议约定。
  offset: number;
  // 一次问答/播报的标识，用于区分不同轮次产生的字幕。
  roundId: string;
}

/**
 * 某一份数字人会话快照所绑定的操作能力。
 *
 * 页面在一轮异步对话中持有该对象，以确认后续操作仍属于同一份会话。
 */
export interface DigitalHumanRoundCapability {
  // 调用方应在异步操作前后检查它，避免旧会话的结果污染新会话。
  isCurrent: () => boolean;
  speak: (text: string, opts?: {
    interrupt?: boolean;
    emotion?: string;
    roundId?: string;
    subtitleSegments?: SubtitleSegment[];
  }) => Promise<void>;
  interrupt: () => Promise<unknown>;
  pollSubtitleEvents: (after?: number) => Promise<SubtitleEvent[]>;
}

// 分别保存“会话变化”和“登录失效”两类监听函数，避免两种事件相互干扰。
const sessionListeners = new Set<(snapshot: DigitalHumanSessionSnapshot | null) => void>();
const authenticationLostListeners = new Set<() => void>();

// 工厂函数接收依赖配置，并返回唯一的底层会话客户端。模块只初始化一次，因此所有调用方共享状态。
const sessionClient = createDigitalHumanSessionClient({
  apiBase: API_BASE,
  getToken,
  onSnapshot: (snapshot) => {
    // 底层快照变化时，将同一个最新值广播给每位订阅者。
    for (const listener of sessionListeners) listener(snapshot);
  },
  onAuthenticationLost: () => {
    for (const listener of authenticationLostListeners) listener();
  },
});

/**
 * 把底层、宽泛的会话能力包装成当前页面需要的强类型能力。
 */
function bindCapability(capability: DigitalHumanSessionCapability): DigitalHumanRoundCapability {
  return {
    // 直接复用底层函数引用，不需要再包一层同样的箭头函数。
    isCurrent: capability.isCurrent,
    async speak(text, opts = {}) {
      // 统一转换并清理文本，避免把空白内容提交给 TTS 服务。
      const content = String(text || '').trim();
      // 文本为空或能力已过期时立即结束，不向后端发送请求。
      if (!content || !capability.isCurrent()) return;
      // `!== false` 表示只有显式传入 false 才不打断；undefined 仍采用“先打断”的默认行为。
      // await 会暂停当前 async 方法，等打断请求完成后再继续，确保操作顺序正确。
      if (opts.interrupt !== false) await capability.interrupt();
      // await 期间会话可能已经被切换，因此真正播报前必须再次检查。
      if (!capability.isCurrent()) return;
      await capability.speak(content, {
        roundId: opts.roundId,
        subtitleSegments: opts.subtitleSegments,
        // 只有设置了情绪时才向底层附加 tts 配置。
        tts: opts.emotion ? { emotion: opts.emotion } : undefined,
      });
    },
    interrupt: capability.interrupt,
    // after 默认从 0 开始，表示在调用方没有游标时从最早可用事件开始查询。
    async pollSubtitleEvents(after = 0) {
      try {
        return await capability.pollSubtitleEvents(after) as SubtitleEvent[];
      } catch {
        // 本层有意把轮询失败降级为空列表，让短暂网络错误不中断页面流程。
        return [];
      }
    },
  };
}

/**
 * 页面统一使用的数字人服务对象。
 */
export const digitalHuman = {
  // null 表示未登录或未能获得会话。
  connect(): Promise<DigitalHumanSessionSnapshot | null> {
    return sessionClient.connect();
  },
  // disconnect 会同时使本地会话失效，并请求后端关闭已建立的会话。
  disconnect(): Promise<void> {
    return sessionClient.disconnect();
  },
  // invalidate 只清理本地状态，不等待远端关闭。
  invalidate(): void {
    sessionClient.invalidate();
  },
  // 只读取当前快照，不创建会话，也不发起网络请求。
  snapshot(): DigitalHumanSessionSnapshot | null {
    return sessionClient.snapshot();
  },
  // capture 把“当前会话”冻结为一份能力；会话切换后，其 isCurrent() 会变成 false。
  capture(): DigitalHumanRoundCapability | null {
    const capability = sessionClient.capture();
    return capability ? bindCapability(capability) : null;
  },
  /**
   * 订阅会话快照变化，并返回取消订阅函数。
   * 调用返回的函数即可取消本次订阅。
   */
  subscribe(listener: (snapshot: DigitalHumanSessionSnapshot | null) => void): () => void {
    sessionListeners.add(listener);
    // 订阅后立即推送一次当前值，调用方无需等到下一次变化才能完成初始渲染。
    listener(sessionClient.snapshot());
    return () => sessionListeners.delete(listener);
  },
  // 登录失效监听不立即触发，只在底层收到认证失败时通知。
  onAuthenticationLost(listener: () => void): () => void {
    authenticationLostListeners.add(listener);
    return () => authenticationLostListeners.delete(listener);
  },
  /**
   * 使用当前会话直接播报文本。这是便捷入口；复杂的一轮对话应先 capture，
   * 然后在异步链路中持续调用同一能力的 isCurrent()，以识别会话是否已过期。
   */
  async speak(text: string, opts: {
    interrupt?: boolean;
    emotion?: string;
    roundId?: string;
    subtitleSegments?: SubtitleSegment[];
  } = {}): Promise<void> {
    const capability = sessionClient.capture();
    // 当前没有已连接会话时静默结束，由上层自行决定是否先调用 connect。
    if (!capability) return;
    await bindCapability(capability).speak(text, opts);
  },
  // 打断操作直接委托给底层客户端；没有会话时底层会安全返回。
  interrupt(): Promise<unknown> {
    return sessionClient.interrupt();
  },
  // 这是不绑定某一轮能力的便捷轮询接口，同样把失败转换为空数组。
  async pollSubtitleEvents(after = 0): Promise<SubtitleEvent[]> {
    try {
      return await sessionClient.pollSubtitleEvents(after) as SubtitleEvent[];
    } catch {
      return [];
    }
  },
};
