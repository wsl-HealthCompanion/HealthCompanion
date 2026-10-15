import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { portableDateColumnType } from '../../common/database/column-types';

/**
 * chat_sessions 表 TypeORM Entity
 * 对应 init-db.sql §3 — chat_sessions
 */
@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_sessions_user')
  @Column({ type: 'uuid' })
  user_id!: string;

  @Index('idx_sessions_session')
  @Column({ type: 'varchar', length: 64, unique: true })
  session_id!: string;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  context_level!: string;

  @Column({ type: 'text', nullable: true })
  context_summary!: string | null;

  // L2 中期记忆 — 会话摘要数组
  // simple-json 在 PG 下自动用 jsonb，SQLite 下用 text，两边兼容
  @Column({ type: 'simple-json', nullable: true })
  memory_summaries!: Array<{
    summary: string;
    keyTopics: string[];
    createdAt: string;
    msgCount: number;
  }> | null;

  @Column({ type: 'int', default: 0 })
  message_count!: number;

  @Index('idx_sessions_last_active')
  @Column({ type: portableDateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  last_active!: Date;

  @Column({ type: portableDateColumnType })
  expires_at!: Date;

  @CreateDateColumn({ type: portableDateColumnType })
  created_at!: Date;
}
