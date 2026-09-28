import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { portableDateColumnType } from '../../../common/database/column-types';

@Entity('admin_permissions')
export class AdminPermission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: portableDateColumnType })
  createdAt!: Date;
}
