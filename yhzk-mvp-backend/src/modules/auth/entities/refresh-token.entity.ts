import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { portableDateColumnType } from '../../../common/database/column-types';

/**
 * refresh_tokens 表 TypeORM Entity
 * 对应 init-db.sql §7 — refresh_tokens
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  token!: string;

  @Column({ type: 'text', default: '{}' })
  device_info!: Record<string, any>;

  @Index('idx_refresh_user')
  @Column({ type: 'boolean', default: false })
  revoked!: boolean;

  @Column({ type: 'integer', default: 0 })
  auth_version!: number;

  @Column({ type: portableDateColumnType })
  expires_at!: Date;

  @CreateDateColumn({ type: portableDateColumnType })
  created_at!: Date;
}
