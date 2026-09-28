import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdminRole } from './admin-role.entity';
import { portableDateColumnType } from '../../../common/database/column-types';

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => AdminRole, { eager: true, nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: AdminRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'failed_login_count', type: 'integer', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'last_login_at', type: portableDateColumnType, nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 64, nullable: true })
  lastLoginIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: portableDateColumnType })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: portableDateColumnType })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: portableDateColumnType, nullable: true })
  deletedAt!: Date | null;
}
