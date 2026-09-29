import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { portableDateColumnType } from '../../common/database/column-types';

/**
 * advisor_match 表 TypeORM Entity
 * 对应 init-db.sql §5 — advisor_match
 */
@Entity('advisor_match')
export class AdvisorMatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_match_user')
  @Column({ type: 'uuid' })
  user_id!: string;

  @Index('idx_match_advisor')
  @Column({ type: 'varchar', length: 64 })
  advisor_id!: string;

  @Column({ type: 'float' })
  match_score!: number;

  @Column({ type: 'text', default: '{}' })
  dimension_scores!: Record<string, number>;

  @Column({ type: 'boolean', default: false })
  is_fallback!: boolean;

  @CreateDateColumn({ type: portableDateColumnType })
  created_at!: Date;
}
