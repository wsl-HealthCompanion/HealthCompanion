import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AvatarModel } from '../upload-ticket.service';
import { portableDateColumnType } from '../../../common/database/column-types';

export type AvatarTaskStatus =
  | 'pending'
  | 'uploading'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted';

@Entity('avatar_generation_tasks')
export class AvatarGenerationTask {
  @PrimaryColumn({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'avatar_id', type: 'varchar', length: 64 })
  avatarId!: string;

  @Column({ type: 'varchar', length: 20 })
  model!: AvatarModel;

  @Column({ type: 'varchar', length: 24 })
  status!: AvatarTaskStatus;

  @Column({ type: 'integer', default: 0 })
  progress!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'started_at', type: portableDateColumnType, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: portableDateColumnType, nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: portableDateColumnType })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: portableDateColumnType })
  updatedAt!: Date;
}
