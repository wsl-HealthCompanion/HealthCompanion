import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { portableDateColumnType } from '../../../common/database/column-types';

/**
 * users 表 TypeORM Entity
 * 对应 init-db.sql §1 — users
 */
export enum UserStatus {
  GUEST = 'guest',
  REGISTERED = 'registered',
  PROFILED = 'profiled',
  ACTIVE = 'active',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_users_openid', { where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', length: 128, unique: true, nullable: true })
  openid!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  unionid!: string | null;

  @Index('idx_users_phone', { where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone!: string | null;

  @Index('idx_users_status', { where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', default: UserStatus.GUEST })
  status!: UserStatus;

  @Column({ type: 'boolean', default: false })
  is_elderly!: boolean;

  @Column({ type: 'boolean', default: false })
  care_mode!: boolean;

  @CreateDateColumn({ type: portableDateColumnType })
  created_at!: Date;

  @UpdateDateColumn({ type: portableDateColumnType })
  updated_at!: Date;

  @Column({ type: portableDateColumnType, nullable: true })
  last_login_at!: Date | null;

  @Column({ type: portableDateColumnType, nullable: true })
  disabled_at!: Date | null;

  @Column({ type: 'integer', default: 0 })
  auth_version!: number;

  @Column({ type: portableDateColumnType, nullable: true })
  deleted_at!: Date | null;
}
