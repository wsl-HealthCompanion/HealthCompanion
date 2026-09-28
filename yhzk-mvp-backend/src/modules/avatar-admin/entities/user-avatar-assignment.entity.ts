import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { portableDateColumnType } from '../../../common/database/column-types';

export type AvatarAssignmentSource = 'migration' | 'automatic' | 'manual' | 'default';

@Entity('user_avatar_assignments')
@Index('uq_user_avatar_assignments_current_user', ['userId'], {
  unique: true,
  where: 'ended_at IS NULL',
})
export class UserAvatarAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'avatar_id', type: 'varchar', length: 64 })
  avatarId!: string;

  @Column({ type: 'varchar', length: 20 })
  source!: AvatarAssignmentSource;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy!: string | null;

  @CreateDateColumn({ name: 'assigned_at', type: portableDateColumnType })
  assignedAt!: Date;

  @Column({ name: 'ended_at', type: portableDateColumnType, nullable: true })
  endedAt!: Date | null;
}
