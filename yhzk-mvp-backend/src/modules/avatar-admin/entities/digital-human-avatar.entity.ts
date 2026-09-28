import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AvatarModel } from '../upload-ticket.service';
import { portableDateColumnType } from '../../../common/database/column-types';

export type AvatarStatus =
  | 'uploading'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'interrupted'
  | 'deleting'
  | 'delete_failed';

const oneDefaultWhere =
  process.env.DB_LIGHTWEIGHT === 'true' || process.env.NODE_ENV === 'test'
    ? '"is_default" = 1 AND "deleted_at" IS NULL'
    : 'is_default = true AND deleted_at IS NULL';

@Entity('digital_human_avatars')
@Index('uq_digital_human_avatars_one_default', ['isDefault'], {
  unique: true,
  where: oneDefaultWhere,
})
export class DigitalHumanAvatar {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  model!: AvatarModel;

  @Column({ type: 'varchar', length: 24 })
  status!: AvatarStatus;

  @Column({ name: 'preview_path', type: 'text', nullable: true })
  previewPath!: string | null;

  @Column({ name: 'source_video_path', type: 'text', nullable: true })
  sourceVideoPath!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: portableDateColumnType })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: portableDateColumnType })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: portableDateColumnType, nullable: true })
  deletedAt!: Date | null;
}
