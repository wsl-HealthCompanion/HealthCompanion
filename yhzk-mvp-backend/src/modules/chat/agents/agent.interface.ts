/**
 * Agent 通用接口
 * 所有智能体必须实现此接口，确保统一调用协议
 * 参考: 智能体架构与搭建指南 §1.4, §8.2
 */

export interface UserContext {
  user_id: string;
  profile_summary: string;
  vital_snapshot?: Record<string, any>;
  active_alerts?: Array<{ level: string; metric: string; deviation: number }>;
  plan_completion_today?: string;
  scene_mode: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface AgentInput {
  user_message: string;
  message_type: 'text' | 'voice' | 'quick_reply';
  conversation_history: Message[];
  user_context: UserContext;
  scene_mode: string;
  downgrade_level: 'none' | 'L1' | 'L2';
  recent_intents: string[];
}

export interface AgentOutput {
  intent?: string;
  confidence?: number;
  routing: string[];
  query_for_agents?: string;
  final_reply: string;
  tts_text?: string;
  quick_replies?: string[];
  emotion_detected?: string;
  should_alert?: boolean;
  answers?: Array<{
    answer: string;
    citations?: Array<{ source: string; text: string }>;
  }>;
  latency_ms: number;
}

/**
 * Agent 基类接口
 */
export interface IAgent {
  readonly name: string;
  process(input: AgentInput): Promise<AgentOutput>;
}
