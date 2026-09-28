import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

/**
 * chat_messages 表 TypeORM Entity
 * 对应 init-db.sql §4 — chat_messages
 */
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_messages_session')
  @Column({ type: 'varchar', length: 64 })
  session_id!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: MessageRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  intent!: string | null;

  @Column({ type: 'float', nullable: true })
  confidence!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  emotion!: string | null;

  @Column({ type: 'text', nullable: true })
  citations!: any;

  @Column({ type: 'text', nullable: true })
  tts_url!: string | null;

  @Column({ type: 'text', nullable: true })
  viseme_data!: any;

  @Column({ type: 'text', nullable: true })
  quick_replies!: any;

  @Column({ type: 'text', default: '{}' })
  meta!: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;
}
