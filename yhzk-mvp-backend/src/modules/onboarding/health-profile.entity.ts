import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../auth/entities/user.entity';

export enum ProfileStep {
  STEP1 = 'step1',
  STEP2A = 'step2a',
  STEP2B = 'step2b',
  STEP2C = 'step2c',
  STEP2D = 'step2d',
  STEP3A = 'step3a',
  STEP3B = 'step3b',
  STEP3C = 'step3c',
  STEP4 = 'step4',
  STEP5 = 'step5',
}

/**
 * health_profiles 表 TypeORM Entity
 * 对应 init-db.sql §2 — health_profiles
 */
@Entity('health_profiles')
export class HealthProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_profiles_user')
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20, default: ProfileStep.STEP1 })
  current_step!: ProfileStep;

  @Index('idx_profiles_status')
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: string;

  @Column({ type: 'text', default: '{}' })
  profile_data!: Record<string, any>;

  @Index('idx_profiles_draft_expiry')
  @Column({ type: 'timestamp' })
  draft_expiry!: Date;

  @Column({ type: 'text', default: '{}' })
  skipped_steps!: string[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  submitted_at!: Date | null;
}
