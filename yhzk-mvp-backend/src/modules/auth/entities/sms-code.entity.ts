import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { portableDateColumnType } from '../../../common/database/column-types';

/**
 * sms_codes 表 TypeORM Entity
 * 对应 init-db.sql §6 — sms_codes
 */
@Entity('sms_codes')
export class SmsCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_sms_phone', { synchronize: false })
  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 10 })
  code!: string;

  @Column({ type: 'varchar', length: 20, default: 'login' })
  type!: string;

  @Column({ type: 'boolean', default: false })
  used!: boolean;

  @Index('idx_sms_expires')
  @Column({ type: portableDateColumnType })
  expires_at!: Date;

  @CreateDateColumn({ type: portableDateColumnType })
  created_at!: Date;
}
